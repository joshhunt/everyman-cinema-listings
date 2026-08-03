import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { config, EVERYMAN_WWW, LOYALTY_CIRCUIT_ID } from "../config.ts";
import { logger } from "../o11y/logger.ts";
import { sessionRefreshes, withSpan } from "../o11y/otel.ts";

const log = logger.child({ module: "session" });

/**
 * The member session copied out of the Everyman site's `loyalty` cookie.
 *
 * These are bearer secrets: they are never logged, never rendered into a page,
 * and never put in a URL we hand to the browser (see routes/book).
 */
interface MemberSession {
  token: string;
  refreshToken: string;
  /** When `token` was last minted, so we can refresh before it goes stale. */
  updatedAt: number;
}

/**
 * Everyman's own app refreshes the session token every 10 minutes. We refresh a
 * little sooner so a link is never handed out with an about-to-expire token.
 */
const REFRESH_AFTER_MS = 8 * 60 * 1000;

let session: MemberSession | undefined;
let inflightRefresh: Promise<MemberSession | undefined> | undefined;

const storePath = path.join(config.cacheDir, "session.json");

try {
  session = JSON.parse(readFileSync(storePath, "utf8"));
  log.info("restored member session from disk");
} catch {
  log.info("no stored member session");
}

async function persist(): Promise<void> {
  try {
    if (session) {
      await writeFile(storePath, JSON.stringify(session), { mode: 0o600 });
    } else {
      await writeFile(storePath, "", { mode: 0o600 });
    }
  } catch (err) {
    log.error({ err }, "failed to persist session");
  }
}

/**
 * Call Everyman's cypher proxy, the same endpoint their own site uses. Member
 * login is Cloudflare Turnstile-protected and deliberately not attempted here;
 * refreshing an existing session is not.
 */
async function cypher(
  route: string,
  method: "GET" | "POST",
  headers: Record<string, string>,
): Promise<any> {
  const res = await fetch(`${EVERYMAN_WWW}/api/cypher`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify({
      reqMetadata: { method, route, responseFormat: "json" },
    }),
  });
  if (!res.ok) throw new Error(`cypher ${route}: HTTP ${res.status}`);
  return res.json();
}

function isOk(response: { statusCode?: number }): boolean {
  return response.statusCode === 0 || response.statusCode === 200;
}

async function refresh(current: MemberSession): Promise<MemberSession | undefined> {
  return withSpan("everyman.refresh-session", {}, async () => {
    try {
      const response = await cypher(
        `/Member/RefreshLogin?circuitId=${encodeURIComponent(LOYALTY_CIRCUIT_ID)}`,
        "GET",
        { "Boxoffice-Refresh-Session-Token": current.refreshToken },
      );

      const tokens = response?.sessionManagementTokens;
      if (!isOk(response ?? {}) || !tokens?.boxofficeSessionToken) {
        // A rejected refresh token means the member session is finished; drop
        // it so links fall back to logged-out rather than failing silently.
        log.warn(
          { peachCode: response?.peachCode, statusCode: response?.statusCode },
          "session refresh rejected, disconnecting",
        );
        sessionRefreshes.add(1, { result: "rejected" });
        session = undefined;
        await persist();
        return undefined;
      }

      session = {
        token: tokens.boxofficeSessionToken,
        refreshToken: tokens.boxofficeRefreshSessionToken ?? current.refreshToken,
        updatedAt: Date.now(),
      };
      await persist();
      sessionRefreshes.add(1, { result: "ok" });
      log.info("session refreshed");
      return session;
    } catch (err) {
      // A transient network failure shouldn't discard a working session.
      log.error({ err }, "session refresh failed");
      sessionRefreshes.add(1, { result: "error" });
      return current;
    }
  });
}

/** Store tokens handed over by the connect bookmarklet. */
export async function connect(token: string, refreshToken: string): Promise<void> {
  session = { token, refreshToken, updatedAt: Date.now() };
  await persist();
  log.info("member session connected");
}

export async function disconnect(): Promise<void> {
  session = undefined;
  await persist();
  log.info("member session disconnected");
}

export function isConnected(): boolean {
  return session !== undefined;
}

/** A session token that is fresh enough to hand to the ticketing site. */
export async function getSessionToken(): Promise<string | undefined> {
  const current = session;
  if (!current) return undefined;

  if (Date.now() - current.updatedAt < REFRESH_AFTER_MS) {
    return current.token;
  }

  inflightRefresh ??= refresh(current).finally(() => {
    inflightRefresh = undefined;
  });
  return (await inflightRefresh)?.token;
}

/**
 * Keep the token fresh in the background, so clicking a booking link never
 * waits on a refresh round trip.
 */
export function startBackgroundRefresh(): void {
  setInterval(() => {
    const current = session;
    if (!current || Date.now() - current.updatedAt < REFRESH_AFTER_MS) return;

    inflightRefresh ??= refresh(current).finally(() => {
      inflightRefresh = undefined;
    });
  }, 60 * 1000).unref();
}
