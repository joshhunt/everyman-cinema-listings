import { config } from "../config.ts";
import { addDays, formatDay, formatTime, relativeDayName, todayISO, windowEndISO } from "../dates.ts";
import { cache } from "./cache.ts";
import {
  extractMovies,
  extractTheaters,
  fetchSchedule,
  fetchSiteHash,
  fetchStaticQueries,
} from "./client.ts";
import { showtimeId } from "./links.ts";
import type { MovieNode, TheaterNode, UpstreamScreening } from "./types.ts";
import type { Prefs } from "../prefs.ts";

export interface Snapshot {
  theaters: TheaterNode[];
  /** Requested theaters in requested order, with their schedules. */
  schedules: TheaterSchedule[];
  /** ISO timestamps of when each cached resource was fetched. */
  fetchedAt: Record<string, string>;
}

export interface TheaterSchedule {
  theater: TheaterNode;
  movies: MovieSchedule[];
}

export interface MovieSchedule {
  movie: MovieNode;
  /** Days in ascending order; screenings in ascending time order. */
  days: { day: string; screenings: UpstreamScreening[] }[];
}

export async function getSnapshot(theaterIds: string[]): Promise<Snapshot> {
  const siteHash = await cache.get("site-hash", {
    resource: "site-hash",
    freshMs: config.siteHashFreshMs,
    fetcher: fetchSiteHash,
  });

  const staticQueries = await cache.get(`static-queries:${siteHash.data}`, {
    resource: "static-queries",
    freshMs: config.staticQueriesFreshMs,
    fetcher: () => fetchStaticQueries(siteHash.data),
  });

  const movies = extractMovies(staticQueries.data);
  const theaters = extractTheaters(staticQueries.data);
  const moviesById = new Map(movies.map((m) => [m.id, m]));
  const movieIds = movies.map((m) => m.id);

  const fetchedAt: Record<string, string> = {
    "site-hash": new Date(siteHash.createdAt).toISOString(),
    "static-queries": new Date(staticQueries.createdAt).toISOString(),
  };

  const schedules = await Promise.all(
    theaterIds.map(async (theaterId) => {
      const theater = theaters.find((t) => t.id === theaterId);
      if (!theater) return undefined;

      const result = await cache.get(`schedule:${theaterId}`, {
        resource: "schedule",
        freshMs: config.scheduleFreshMs,
        fetcher: () =>
          fetchSchedule(
            theaterId,
            theater.timeZone || "Europe/London",
            movieIds,
            new Date(`${todayISO()}T00:00:00Z`),
            new Date(`${addDays(todayISO(), config.scheduleWindowDays)}T23:59:59Z`),
          ),
      });
      fetchedAt[`schedule:${theaterId}`] = new Date(result.createdAt).toISOString();

      const forTheater = result.data[theaterId]?.schedule ?? {};
      const movieSchedules: MovieSchedule[] = [];

      for (const [movieId, byDay] of Object.entries(forTheater)) {
        const movie = moviesById.get(movieId);
        if (!movie) continue;

        const days = Object.entries(byDay)
          .map(([day, screenings]) => ({
            day,
            screenings: [...screenings].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
          }))
          .sort((a, b) => a.day.localeCompare(b.day));

        if (days.length > 0) {
          movieSchedules.push({ movie, days });
        }
      }

      movieSchedules.sort((a, b) =>
        firstScreeningOf(a).localeCompare(firstScreeningOf(b)),
      );

      return { theater, movies: movieSchedules } satisfies TheaterSchedule;
    }),
  );

  return {
    theaters,
    schedules: schedules.filter((s) => s !== undefined),
    fetchedAt,
  };
}

function firstScreeningOf(movie: MovieSchedule): string {
  return movie.days[0]?.screenings[0]?.startsAt ?? "9999";
}

// ---------------------------------------------------------------------------
// View models

export interface ScreeningView {
  time: string;
  url?: string;
  badges: string[];
  almostFull: boolean;
}

const BADGE_LABELS: Record<string, string> = {
  "Showtime.Restriction.BabyClub": "baby club",
  "Showtime.Restriction.KidsFriendly": "kids",
  "Showtime.Restriction.SilverScreen": "silver screen",
  "Showtime.Restriction.LoyaltyOnly": "members",
  "Showtime.Event.Preview": "preview",
  "Showtime.Accessibility.ClosedCaption": "CC",
  "Showtime.Accessibility.Subtitled": "subs",
  "Showtime.Accessibility.Dubbed": "dubbed",
};

function toScreeningView(screening: UpstreamScreening): ScreeningView {
  const id = showtimeId(screening.data.ticketing);
  return {
    time: formatTime(screening.startsAt),
    // Our own redirect, which attaches the member session at click time.
    url: id ? `/book/${id}` : undefined,
    badges: screening.tags.map((t) => BADGE_LABELS[t]).filter((b) => b !== undefined),
    almostFull: screening.tags.includes("Internal.Data.AlmostSoldOut"),
  };
}

/**
 * Cached schedules can contain days/screenings that have since passed;
 * clip to [today, today + daysAhead resolved to the playweek boundary].
 */
function clipDays<T extends { day: string; screenings: UpstreamScreening[] }>(
  days: T[],
  prefs: Prefs,
): { day: string; screenings: UpstreamScreening[] }[] {
  const today = todayISO();
  const end = windowEndISO(prefs.daysAhead);
  const nowWallClock = new Date().toLocaleString("sv-SE", { timeZone: "Europe/London" }).replace(" ", "T");

  return days
    .filter((d) => d.day >= today && d.day <= end)
    .map((d) => ({
      day: d.day,
      screenings: d.screenings.filter((s) => !s.isExpired && s.startsAt >= nowWallClock),
    }))
    .filter((d) => d.screenings.length > 0);
}

// --- By movie (the classic view)

export interface ByMovieTheater {
  theater: TheaterNode;
  movies: ByMovieMovie[];
}

export interface ByMovieMovie {
  movie: MovieNode;
  movieUrl: string;
  seen: boolean;
  isAtEarlierTheater: boolean;
  collapsed: boolean;
  days: { label: string; screenings: ScreeningView[] }[];
}

export function byMovieView(snapshot: Snapshot, prefs: Prefs): ByMovieTheater[] {
  const seenAtEarlierTheater = new Set<string>();

  return snapshot.schedules.map((theaterSchedule) => {
    const movies: ByMovieMovie[] = [];

    for (const { movie, days } of theaterSchedule.movies) {
      const clippedDays = clipDays(days, prefs);
      if (clippedDays.length === 0) continue;

      const isAtEarlierTheater = seenAtEarlierTheater.has(movie.id);
      seenAtEarlierTheater.add(movie.id);

      const seen = prefs.seenMovieIds.includes(movie.id);
      if (seen && isAtEarlierTheater) continue;

      movies.push({
        movie,
        movieUrl: `https://www.everymancinema.com${movie.path}`,
        seen,
        isAtEarlierTheater,
        collapsed: seen || isAtEarlierTheater,
        days: clippedDays.map((d) => ({
          label: formatDay(d.day),
          screenings: d.screenings.map((s) => toScreeningView(s)),
        })),
      });
    }

    movies.sort((a, b) => rank(a) - rank(b));

    return { theater: theaterSchedule.theater, movies };
  });
}

function rank(movie: ByMovieMovie): number {
  return movie.seen ? 2 : movie.isAtEarlierTheater ? 1 : -1;
}

// --- By day (per-cinema)

export interface ByDayDay {
  day: string;
  label: string;
  relative?: string;
  movies: ByDayMovie[];
}

export interface ByDayMovie {
  movie: MovieNode;
  movieUrl: string;
  seen: boolean;
  screenings: ScreeningView[];
}

export function byDayView(snapshot: Snapshot, theaterId: string, prefs: Prefs): ByDayDay[] {
  const theaterSchedule = snapshot.schedules.find((s) => s.theater.id === theaterId);
  if (!theaterSchedule) return [];

  const byDay = new Map<string, { firstStartsAt: string; entry: ByDayMovie }[]>();

  for (const { movie, days } of theaterSchedule.movies) {
    for (const { day, screenings } of clipDays(days, prefs)) {
      const entry: ByDayMovie = {
        movie,
        movieUrl: `https://www.everymancinema.com${movie.path}`,
        seen: prefs.seenMovieIds.includes(movie.id),
        screenings: screenings.map((s) => toScreeningView(s)),
      };
      const item = { firstStartsAt: screenings[0].startsAt, entry };
      const list = byDay.get(day);
      if (list) {
        list.push(item);
      } else {
        byDay.set(day, [item]);
      }
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, items]) => ({
      day,
      label: formatDay(day),
      relative: relativeDayName(day),
      movies: items
        .sort((a, b) => a.firstStartsAt.localeCompare(b.firstStartsAt))
        .map((i) => i.entry),
    }));
}
