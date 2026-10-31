import { Hono } from "hono";
import { EVERYMAN_WWW, PURCHASE_BASE } from "./config.ts";
import { logger } from "./o11y/logger.ts";
import { getSnapshot, screenLabel } from "./everyman/service.ts";
import { showtimeId } from "./everyman/links.ts";
import { getRuntime } from "./everyman/tmdb.ts";
import type {
  MovieNode,
  ScreeningTicketing,
  TheaterNode,
  UpstreamScreening,
} from "./everyman/types.ts";

const log = logger.child({ module: "api" });

/**
 * Stateless JSON API for native clients. Unlike the HTML views it reads no
 * cookies: every filter is a query parameter, and it never touches the member
 * session, so booking links are the plain logged-out purchase URLs.
 *
 * Times are wall-clock strings in the cinema's own time zone, with no offset
 * ("2026-08-03T14:15:00"), exactly as the upstream feed gives them. Combine
 * with the theater's `timeZone` to get an instant.
 */
export const api = new Hono();

api.onError((err, c) => {
  log.error({ err, path: c.req.path }, "api request failed");
  return c.json({ error: "upstream_unavailable", message: err.message }, 502);
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface ApiTheater {
  id: string;
  name: string;
  timeZone: string;
  path: string;
  url: string;
}

export interface ApiMovie {
  id: string;
  title: string;
  path: string;
  url: string;
  certificate: string | null;
  genres: string;
  release: string | null;
  /** Everyman's own runtime; null on every film in practice. */
  upstreamRuntimeMinutes: number | null;
  /** From TMDB, matched by title. Null until looked up, or when unmatched. */
  runtimeMinutes: number | null;
}

export interface ApiScreening {
  id: string;
  movieId: string;
  /** Cinema-local day, YYYY-MM-DD. */
  day: string;
  startsAt: string;
  /** Raw upstream tags, e.g. "Showtime.Accessibility.ClosedCaption". */
  tags: string[];
  screen: { name: string | null; label: string };
  /** Percent of seats sold (0–100), when the feed reports it. */
  occupancyRate: number | null;
  showtimeId: string | null;
  bookingUrl: string | null;
  ticketing: ScreeningTicketing[];
}

function theaterJson(t: TheaterNode): ApiTheater {
  return {
    id: t.id,
    name: t.name,
    timeZone: t.timeZone,
    path: t.path,
    url: `${EVERYMAN_WWW}${t.path}`,
  };
}

function movieJson(m: MovieNode): ApiMovie {
  return {
    id: m.id,
    title: m.title,
    path: m.path,
    url: `${EVERYMAN_WWW}${m.path}`,
    certificate: m.certificate,
    genres: m.genres,
    release: m.release,
    upstreamRuntimeMinutes: m.runtime,
    runtimeMinutes: getRuntime(m.title) ?? null,
  };
}

function screeningJson(s: UpstreamScreening, movieId: string, day: string): ApiScreening {
  const id = showtimeId(s.data.ticketing);
  return {
    id: s.id,
    movieId,
    day,
    startsAt: s.startsAt,
    tags: s.tags,
    screen: { name: s.screen?.name?.trim() || null, label: screenLabel(s.screen?.name) },
    occupancyRate: s.occupancy?.rate ?? null,
    showtimeId: id ?? null,
    bookingUrl: id ? `${PURCHASE_BASE}/launch/ticketing/${encodeURIComponent(id)}` : null,
    ticketing: s.data.ticketing,
  };
}

api.get("/theaters", async (c) => {
  const snapshot = await getSnapshot([]);
  return c.json({
    fetchedAt: snapshot.fetchedAt,
    theaters: snapshot.theaters.map(theaterJson),
  });
});

/**
 * Upcoming screenings at one cinema, flat, with the films they reference.
 *
 *   from  YYYY-MM-DD, default today (cinema-local)
 *   to    YYYY-MM-DD inclusive, default: everything the scraper has
 *
 * Screenings that have already started are omitted.
 */
api.get("/theaters/:theaterId/screenings", async (c) => {
  const theaterId = c.req.param("theaterId");
  const snapshot = await getSnapshot([theaterId]);
  const theater = snapshot.theaters.find((t) => t.id === theaterId);
  if (!theater) {
    return c.json({ error: "not_found", message: `Unknown theater ${theaterId}` }, 404);
  }

  const nowLocal = new Date()
    .toLocaleString("sv-SE", { timeZone: theater.timeZone || "Europe/London" })
    .replace(" ", "T");
  const today = nowLocal.slice(0, 10);

  const from = c.req.query("from") ?? today;
  const to = c.req.query("to");
  if (!DAY.test(from) || (to !== undefined && !DAY.test(to))) {
    return c.json({ error: "bad_request", message: "from/to must be YYYY-MM-DD" }, 400);
  }

  const movies: ApiMovie[] = [];
  const screenings: ApiScreening[] = [];

  for (const { movie, days } of snapshot.schedules[0]?.movies ?? []) {
    let used = false;
    for (const { day, screenings: list } of days) {
      if (day < from || (to !== undefined && day > to)) continue;
      for (const s of list) {
        if (s.isExpired || s.startsAt < nowLocal) continue;
        screenings.push(screeningJson(s, movie.id, day));
        used = true;
      }
    }
    if (used) movies.push(movieJson(movie));
  }

  screenings.sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.screen.label.localeCompare(b.screen.label),
  );

  return c.json({
    theater: theaterJson(theater),
    fetchedAt: snapshot.fetchedAt,
    from,
    to: to ?? null,
    movies,
    screenings,
  });
});

// Hono doesn't apply a mounted sub-app's notFound handler, so catch here.
api.all("*", (c) => c.json({ error: "not_found", message: "No such endpoint" }, 404));
