import "./o11y/otel.ts";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { Hono } from "hono";
import { logger } from "./o11y/logger.ts";
import { httpRequestDuration, prometheusExporter } from "./o11y/otel.ts";
import { config, DEFAULT_THEATERS_RANKED } from "./config.ts";
import { cache } from "./everyman/cache.ts";
import { byDayView, byMovieView, getSnapshot } from "./everyman/service.ts";
import { readPrefs, writePref } from "./prefs.ts";
import { byMoviePage } from "./views/byMovie.ts";
import { byDayPage } from "./views/byDay.ts";

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

app.onError((err, c) => {
  log.error({ err, path: c.req.path }, "request failed");
  return c.text(`Error: ${err.message}`, 500);
});

// --- Views

app.get("/", async (c) => {
  const prefs = readPrefs(c);
  const snapshot = await getSnapshot(prefs.theaters);
  const theaters = byMovieView(snapshot, prefs);
  return c.html(byMoviePage(snapshot, theaters, prefs));
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
  return c.html(byDayPage(snapshot, days, theater, prefs));
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

app.get("/set-link-mode", (c) => {
  const mode = c.req.query("mode");
  if (mode !== "keep-login" && mode !== "direct") return c.text("Invalid mode", 400);

  writePref(c, "linkMode", mode);
  return c.redirect(backTo(c));
});

// --- Operational endpoints

app.get("/healthz", (c) => c.json({ ok: true, cache: cache.ages() }));

app.get("/metrics", (c) => {
  // Bridge the Prometheus exporter's node-style handler into Hono.
  const { incoming, outgoing } = c.env as {
    incoming: import("node:http").IncomingMessage;
    outgoing: import("node:http").ServerResponse;
  };
  prometheusExporter.getMetricsRequestHandler(incoming, outgoing);
  return RESPONSE_ALREADY_SENT;
});

app.use("/public/*", serveStatic({ root: "./" }));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info({ port: info.port }, "server listening");
});

// Warm the default snapshot so the first request after a restart is fast.
getSnapshot(DEFAULT_THEATERS_RANKED)
  .then(() => log.info("warmup complete"))
  .catch((err) => log.warn({ err }, "warmup failed"));
