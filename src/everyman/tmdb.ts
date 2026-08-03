import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
import { logger } from "../o11y/logger.ts";
import { tmdbLookups, upstreamFetchDuration, withSpan } from "../o11y/otel.ts";

const log = logger.child({ module: "tmdb" });

/**
 * Film runtimes from TMDB.
 *
 * Everyman's feed has `runtime: null` on every film, and their ticketing
 * vendor's API needs a token we can't get server-side, so runtimes come from
 * TMDB — matched on title, since there is no shared identifier.
 *
 * Lookups never block a page render: views read whatever is cached and the
 * misses are filled in the background.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";

/** Runtimes don't change; re-check occasionally in case of a correction. */
const HIT_TTL_MS = 180 * 24 * 60 * 60 * 1000;
/** Retry misses sooner — a film may not be in TMDB yet on release week. */
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_CONCURRENT = 4;

interface Entry {
  /** null means "looked up, not found". */
  runtime: number | null;
  tmdbId?: number;
  tmdbTitle?: string;
  fetchedAt: number;
}

const storePath = path.join(config.cacheDir, "tmdb-runtimes.json");
let entries = new Map<string, Entry>();

try {
  const loaded = JSON.parse(readFileSync(storePath, "utf8"));
  entries = new Map(Object.entries(loaded));
  log.info({ films: entries.size }, "loaded tmdb runtimes");
} catch {
  log.info("no cached tmdb runtimes yet");
}

let writeScheduled = false;
function scheduleWrite(): void {
  if (writeScheduled) return;
  writeScheduled = true;
  setTimeout(() => {
    writeScheduled = false;
    writeFile(storePath, JSON.stringify(Object.fromEntries(entries))).catch((err) =>
      log.error({ err }, "failed to persist tmdb runtimes"),
    );
  }, 1000).unref();
}

// ---------------------------------------------------------------------------
// Title heuristics
//
// Everyman dress their titles up with programme strands and format notes that
// TMDB knows nothing about. Candidates are tried strictest-first, and a match
// must equal the query exactly once normalised, so a failed clean-up leaves the
// film unmatched rather than attaching some other film's runtime.

/** Programme strands Everyman prefix onto a title. */
const STRAND = new RegExp(
  "^(throwback|toddler club|family film club|kids club|baby club|silver screen" +
    "|members.? preview|members.? screening|sound of fringe|lost explorer presents" +
    "|times \\+ presents|screen arts|everyman presents|classic|cult|preview)\\b\\s*:?\\s*",
  "i",
);

/** A possessive author credit TMDB usually omits: "Dr Seuss' The Lorax". */
const POSSESSIVE = /^(?:[A-Z][\w.]*\s+){0,2}[A-Z][\w.]*['’]s?\s+/;

/** Presentation notes appended to a title. */
const SUFFIX = /\s*[-–]?\s*(sing[- ]?along|quote[- ]?along|encore|reissue|live)\s*$/i;

export function normaliseTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchCandidates(title: string): { queries: string[]; year?: string } {
  const queries: string[] = [];
  const add = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !queries.includes(trimmed)) queries.push(trimmed);
  };

  const original = title.trim();
  add(original);

  // A parenthesised year disambiguates re-releases ("Solaris (1972)").
  const year = original.match(/\((\d{4})\)/)?.[1];

  add(original.replace(/\s*\([^)]*\)/g, ""));
  for (const base of [...queries]) add(base.replace(SUFFIX, ""));
  for (const base of [...queries]) {
    const stripped = base.replace(STRAND, "");
    if (stripped !== base) add(stripped);
  }
  for (const base of [...queries]) {
    const stripped = base.replace(POSSESSIVE, "");
    if (stripped !== base) add(stripped);
  }

  return { queries, year };
}

// ---------------------------------------------------------------------------

function readToken(): string | undefined {
  const token = process.env.TMDB_READ_API_KEY?.trim();
  return token ? token : undefined;
}

async function tmdb<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const token = readToken();
  if (!token) throw new Error("TMDB_READ_API_KEY not set");

  const url = `${TMDB_BASE}${endpoint}?${new URLSearchParams(params)}`;
  const start = performance.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`tmdb ${endpoint}: HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    upstreamFetchDuration.record((performance.now() - start) / 1000, { resource: "tmdb" });
  }
}

interface SearchResult {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
}

async function lookup(title: string): Promise<Entry> {
  return withSpan("tmdb.lookup", { title }, async () => {
    const { queries, year } = searchCandidates(title);

    for (const query of queries) {
      const params: Record<string, string> = { query };
      if (year) params.year = year;

      const search = await tmdb<{ results?: SearchResult[] }>("/search/movie", params);
      const wanted = normaliseTitle(query);

      const hit = (search.results ?? [])
        .slice(0, 8)
        .find(
          (r) =>
            normaliseTitle(r.title) === wanted ||
            (r.original_title !== undefined && normaliseTitle(r.original_title) === wanted),
        );
      if (!hit) continue;

      const detail = await tmdb<{ runtime?: number }>(`/movie/${hit.id}`, {});
      if (!detail.runtime) continue;

      log.debug({ title, matched: hit.title, runtime: detail.runtime }, "tmdb match");
      return { runtime: detail.runtime, tmdbId: hit.id, tmdbTitle: hit.title, fetchedAt: Date.now() };
    }

    log.info({ title }, "no tmdb match, will use schedule estimate");
    return { runtime: null, fetchedAt: Date.now() };
  });
}

function isFresh(entry: Entry): boolean {
  const ttl = entry.runtime === null ? MISS_TTL_MS : HIT_TTL_MS;
  return Date.now() - entry.fetchedAt < ttl;
}

/** Cached runtime for a title. Never triggers a fetch, so it's safe to render with. */
export function getRuntime(title: string): number | undefined {
  const entry = entries.get(normaliseTitle(title));
  return entry?.runtime ?? undefined;
}

const inflight = new Set<string>();

/**
 * Fill in any runtimes we don't have yet, in the background. Safe to call on
 * every request: known titles and in-flight lookups are skipped.
 */
export function ensureRuntimes(titles: Iterable<string>): void {
  if (!readToken()) return;

  const pending: string[] = [];
  for (const title of titles) {
    const key = normaliseTitle(title);
    if (!key || inflight.has(key)) continue;

    const entry = entries.get(key);
    if (entry && isFresh(entry)) continue;

    inflight.add(key);
    pending.push(title);
  }
  if (pending.length === 0) return;

  log.info({ count: pending.length }, "fetching runtimes from tmdb");

  const queue = [...pending];
  const worker = async (): Promise<void> => {
    for (let title = queue.shift(); title !== undefined; title = queue.shift()) {
      const key = normaliseTitle(title);
      try {
        const entry = await lookup(title);
        entries.set(key, entry);
        tmdbLookups.add(1, { result: entry.runtime === null ? "miss" : "hit" });
        scheduleWrite();
      } catch (err) {
        // Leave it uncached so the next pass retries.
        log.error({ err, title }, "tmdb lookup failed");
        tmdbLookups.add(1, { result: "error" });
      } finally {
        inflight.delete(key);
      }
    }
  };

  void Promise.all(Array.from({ length: MAX_CONCURRENT }, worker)).catch(() => {});
}

export function runtimeStats(): { known: number; missing: number; configured: boolean } {
  let known = 0;
  let missing = 0;
  for (const entry of entries.values()) {
    if (entry.runtime === null) missing++;
    else known++;
  }
  return { known, missing, configured: readToken() !== undefined };
}
