import "./o11y/otel.ts";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { etag } from "hono/etag";
import { logger } from "./o11y/logger.ts";
import { bookingRedirects, httpRequestDuration, prometheusExporter } from "./o11y/otel.ts";
import { config, DEFAULT_THEATERS_RANKED, EVERYMAN_WWW } from "./config.ts";
import { cache } from "./everyman/cache.ts";
import { byDayView, byMovieView, getSnapshot } from "./everyman/service.ts";
import { ticketingRedirect } from "./everyman/links.ts";
import {
  connect,
  disconnect,
  getSessionToken,
  isConnected,
  startBackgroundRefresh,
} from "./everyman/session.ts";
import { readPrefs, writePref } from "./prefs.ts";
import { byMoviePage } from "./views/byMovie.ts";
import { byDayPage } from "./views/byDay.ts";
import { connectPage } from "./views/connect.ts";

const log = logger.child({ module: "server" });
const app = new Hono();

// --- Middleware: request logging + duration metric
app.use("*", async (c, next) => {
  const start = performance.now();
  await next();
  const seconds = (performance.now() - start) / 1000;
  const route = c.req.routePath;
  httpRequestDuration.record(seconds, {
    route,
    method: c.req.method,
    status: c.res.status,
  });
  if (!route.startsWith("/public") && route !== "/healthz" && route !== "/metrics") {
    log.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, seconds },
      "request",
    );
  }
});

// ETag + compression for rendered pages and assets. /metrics writes to the
// node response directly, so it must not pass through either.
const compressible = (path: string) => path !== "/metrics";

app.use("*", async (c, next) => {
  if (!compressible(c.req.path)) return next();
  await etag()(c, async () => {
    await compress()(c, next);
  });
});

app.onError((err, c) => {
  log.error({ err, path: c.req.path }, "request failed");
  return c.text(`Error: ${err.message}`, 500);
});

// --- Views

app.get("/", async (c) => {
  const prefs = readPrefs(c);
  const snapshot = await getSnapshot(prefs.theaters);
  const theaters = byMovieView(snapshot, prefs);
  return c.html(byMoviePage(snapshot, theaters, prefs, isConnected()));
});

app.get("/day", (c) => {
  const prefs = readPrefs(c);
  const first = prefs.theaters[0] ?? DEFAULT_THEATERS_RANKED[0];
  return c.redirect(`/day/${first}`);
});

app.get("/day/:theaterId", async (c) => {
  const prefs = readPrefs(c);
  const theaterId = c.req.param("theaterId");

  // Allow viewing by-day for a theater that isn't in the selected set.
  const theaterIds = prefs.theaters.includes(theaterId)
    ? prefs.theaters
    : [...prefs.theaters, theaterId];

  const snapshot = await getSnapshot(theaterIds);
  const theater = snapshot.theaters.find((t) => t.id === theaterId);
  if (!theater) {
    return c.text(`Unknown theater ${theaterId}`, 404);
  }

  const days = byDayView(snapshot, theaterId, prefs);
  return c.html(byDayPage(snapshot, days, theater, prefs, isConnected()));
});

// --- Booking: attach the member session at click time, so the token never
// appears in a page, a Referer header, or a browser history entry.

app.get("/book/:showtimeId", async (c) => {
  const showtimeId = c.req.param("showtimeId");
  if (!/^[A-Za-z0-9-]{1,64}$/.test(showtimeId)) {
    return c.text("Invalid showtime id", 400);
  }

  const token = await getSessionToken();
  bookingRedirects.add(1, { session: token ? "attached" : "none" });

  // 302 so the browser doesn't cache a URL containing a short-lived token.
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return c.redirect(ticketingRedirect(showtimeId, token), 302);
});

// --- Account connection

app.get("/connect", (c) => c.html(connectPage(isConnected())));

app.get("/disconnect", async (c) => {
  await disconnect();
  return c.redirect("/connect");
});

// The bookmarklet runs on everymancinema.com, so this one endpoint is
// cross-origin. Only that origin may call it, and only to hand over tokens.
const connectCors = {
  "Access-Control-Allow-Origin": EVERYMAN_WWW,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
};

app.options("/api/connect", (c) => c.body(null, 204, connectCors));

app.post("/api/connect", async (c) => {
  const body = await c.req.json().catch(() => undefined);
  const token = typeof body?.token === "string" ? body.token : undefined;
  const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken : undefined;

  if (!token || !refreshToken) {
    return c.json({ ok: false, error: "token and refreshToken are required" }, 400, connectCors);
  }

  await connect(token, refreshToken);
  return c.json({ ok: true }, 200, connectCors);
});

// --- Settings (cookie-backed, GET + redirect back)

function backTo(c: { req: { query: (k: string) => string | undefined } }): string {
  const back = c.req.query("back") ?? "/";
  return back.startsWith("/") ? back : "/";
}

app.get("/set-theater", (c) => {
  const prefs = readPrefs(c);
  const theaterId = c.req.query("theaterId");
  if (!theaterId) return c.text("No theater ID provided", 400);

  const theaters = prefs.theaters.includes(theaterId)
    ? prefs.theaters.filter((id) => id !== theaterId)
    : [...prefs.theaters, theaterId];

  writePref(c, "theaters", theaters.join(","));
  return c.redirect(backTo(c));
});

app.get("/set-days-ahead", (c) => {
  const days = Number(c.req.query("days"));
  if (!Number.isFinite(days) || days <= 0) return c.text("Invalid days ahead provided", 400);

  writePref(c, "daysAhead", String(days));
  return c.redirect(backTo(c));
});

app.get("/set-seen", (c) => {
  const prefs = readPrefs(c);
  const movieId = c.req.query("movieId");
  if (!movieId) return c.text("No movie ID provided", 400);

  const seen = prefs.seenMovieIds.includes(movieId)
    ? prefs.seenMovieIds.filter((id) => id !== movieId)
    : [...prefs.seenMovieIds, movieId];

  writePref(c, "seenMovieIds", seen.join(","));
  return c.redirect(backTo(c));
});

// --- Operational endpoints

app.get("/healthz", (c) =>
  c.json({ ok: true, memberSessionConnected: isConnected(), cache: cache.ages() }),
);

app.get("/metrics", (c) => {
  // Bridge the Prometheus exporter's node-style handler into Hono.
  const { incoming, outgoing } = c.env as {
    incoming: import("node:http").IncomingMessage;
    outgoing: import("node:http").ServerResponse;
  };
  prometheusExporter.getMetricsRequestHandler(incoming, outgoing);
  return RESPONSE_ALREADY_SENT;
});

app.use(
  "/public/*",
  serveStatic({
    root: "./",
    onFound: (_path, c) => {
      c.header("Cache-Control", "public, max-age=3600");
    },
  }),
);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info({ port: info.port }, "server listening");
});

startBackgroundRefresh();

// Warm the default snapshot so the first request after a restart is fast.
getSnapshot(DEFAULT_THEATERS_RANKED)
  .then(() => log.info("warmup complete"))
  .catch((err) => log.warn({ err }, "warmup failed"));
