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
import { getRuntime, ensureRuntimes } from "./tmdb.ts";
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

  const snapshot: Snapshot = {
    theaters,
    schedules: schedules.filter((s) => s !== undefined),
    fetchedAt,
  };

  // Fill in any unknown runtimes in the background, so a render never waits on
  // TMDB. Whatever isn't cached yet falls back to the schedule estimate.
  ensureRuntimes(
    snapshot.schedules.flatMap((s) => s.movies.map((m) => m.movie.title)),
  );

  return snapshot;
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

const UNKNOWN_SCREEN = "Screen ?";

/** Normalise the inconsistent upstream names to a single "Screen N" form. */
function screenLabel(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return UNKNOWN_SCREEN;
  return /^\d+$/.test(trimmed) ? `Screen ${trimmed}` : trimmed;
}

/** Numeric where possible, so Screen 10 sorts after Screen 9. */
function screenOrder(label: string): number {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

// --- Calendar (per-cinema): screens as lanes on a time axis

/**
 * The listed time is when the room opens; the feature starts 25 minutes later,
 * after ads and trailers.
 */
export const ADS_MINUTES = 25;

/**
 * How long a screening occupies its screen.
 *
 * Everyman publish no runtime — `runtime` is null on every movie node — so this
 * is derived from the schedule instead: the shortest gap between consecutive
 * showings on one screen is ads + film + turnaround, which is exactly the
 * occupancy a calendar wants to draw. It checks out against films whose runtime
 * is known from the ticketing site.
 */
const DEFAULT_SLOT_MINUTES = 150;
const MIN_SLOT_MINUTES = 45;
const MAX_SLOT_MINUTES = 300;

function minutesOfDay(startsAt: string): number {
  return Number(startsAt.slice(11, 13)) * 60 + Number(startsAt.slice(14, 16));
}

function estimateSlotMinutes(snapshot: Snapshot): Map<string, number> {
  // (theater, day, screen) -> [start minutes, movieId]
  const lanes = new Map<string, { minute: number; movieId: string }[]>();

  for (const theaterSchedule of snapshot.schedules) {
    for (const { movie, days } of theaterSchedule.movies) {
      for (const { day, screenings } of days) {
        for (const screening of screenings) {
          const key = `${theaterSchedule.theater.id}|${day}|${screenLabel(screening.screen?.name)}`;
          const lane = lanes.get(key) ?? [];
          lane.push({ minute: minutesOfDay(screening.startsAt), movieId: movie.id });
          lanes.set(key, lane);
        }
      }
    }
  }

  const shortestGap = new Map<string, number>();
  for (const lane of lanes.values()) {
    lane.sort((a, b) => a.minute - b.minute);
    for (let i = 0; i < lane.length - 1; i++) {
      const gap = lane[i + 1].minute - lane[i].minute;
      if (gap < MIN_SLOT_MINUTES || gap > MAX_SLOT_MINUTES) continue;

      const current = shortestGap.get(lane[i].movieId);
      if (current === undefined || gap < current) {
        shortestGap.set(lane[i].movieId, gap);
      }
    }
  }
  return shortestGap;
}

export interface CalendarBlock {
  movie: MovieNode;
  movieUrl: string;
  bookUrl?: string;
  seen: boolean;
  almostFull: boolean;
  badges: string[];
  /** Minutes from midnight. */
  startMinute: number;
  /** Ads plus the feature: how long the screening really runs. */
  slotMinutes: number;
  /** Width to draw, clipped so a block never laps over the next showing. */
  drawMinutes: number;
  runtimeMinutes?: number;
  listedTime: string;
  filmStartTime: string;
  endTime: string;
  /** False when slotMinutes came from a known runtime. */
  estimated: boolean;
}

export interface CalendarDay {
  day: string;
  label: string;
  relative?: string;
  /** Axis bounds, in minutes from midnight, rounded to whole hours. */
  axisStart: number;
  axisEnd: number;
  hours: { minute: number; label: string }[];
  /** Minutes from midnight for the "now" marker, when this day is today. */
  nowMinute?: number;
  screens: { label: string; blocks: CalendarBlock[] }[];
}

function formatMinute(minute: number): string {
  const hours24 = Math.floor(minute / 60) % 24;
  const mins = minute % 60;
  const suffix = hours24 >= 12 ? "pm" : "am";
  const h12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${h12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function calendarView(
  snapshot: Snapshot,
  theaterId: string,
  prefs: Prefs,
): CalendarDay[] {
  const theaterSchedule = snapshot.schedules.find((s) => s.theater.id === theaterId);
  if (!theaterSchedule) return [];

  const slotEstimates = estimateSlotMinutes(snapshot);
  const today = todayISO();
  const nowMinutes = (() => {
    const local = new Date().toLocaleString("sv-SE", { timeZone: "Europe/London" });
    return Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  })();

  type Lane = Map<string, CalendarBlock[]>;
  const byDay = new Map<string, Lane>();

  for (const { movie, days } of theaterSchedule.movies) {
    for (const { day, screenings } of clipDays(days, prefs)) {
      const lanes: Lane = byDay.get(day) ?? new Map();
      byDay.set(day, lanes);

      for (const screening of screenings) {
        const view = toScreeningView(screening);
        const startMinute = minutesOfDay(screening.startsAt);

        // A known runtime gives the exact answer the user cares about: ads plus
        // the feature. Otherwise fall back to the gap derived from the schedule.
        const runtimeMinutes = getRuntime(movie.title);
        const slotMinutes = runtimeMinutes
          ? ADS_MINUTES + runtimeMinutes
          : (slotEstimates.get(movie.id) ?? DEFAULT_SLOT_MINUTES);

        const label = screenLabel(screening.screen?.name);
        const blocks = lanes.get(label) ?? [];
        blocks.push({
          movie,
          movieUrl: `https://www.everymancinema.com${movie.path}`,
          bookUrl: view.url,
          seen: prefs.seenMovieIds.includes(movie.id),
          almostFull: view.almostFull,
          badges: view.badges,
          startMinute,
          slotMinutes,
          drawMinutes: slotMinutes,
          runtimeMinutes,
          listedTime: view.time,
          filmStartTime: formatMinute(startMinute + ADS_MINUTES),
          endTime: formatMinute(startMinute + slotMinutes),
          estimated: runtimeMinutes === undefined,
        });
        lanes.set(label, blocks);
      }
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, lanes]) => {
      const all = [...lanes.values()].flat();
      const earliest = Math.min(...all.map((b) => b.startMinute));
      const latest = Math.max(...all.map((b) => b.startMinute + b.drawMinutes));

      const axisStart = Math.floor(earliest / 60) * 60;
      const axisEnd = Math.ceil(latest / 60) * 60;

      const hours: { minute: number; label: string }[] = [];
      for (let minute = axisStart; minute <= axisEnd; minute += 60) {
        hours.push({ minute, label: formatMinute(minute).replace(":00", "") });
      }

      return {
        day,
        label: formatDay(day),
        relative: relativeDayName(day),
        axisStart,
        axisEnd,
        hours,
        nowMinute:
          day === today && nowMinutes >= axisStart && nowMinutes <= axisEnd
            ? nowMinutes
            : undefined,
        screens: [...lanes.entries()]
          .sort(([a], [b]) => screenOrder(a) - screenOrder(b) || a.localeCompare(b))
          .map(([label, blocks]) => {
            blocks.sort((a, b) => a.startMinute - b.startMinute);

            // Keep blocks from lapping over the next showing, which would
            // otherwise happen wherever a runtime is longer than the schedule
            // allows for. The tooltip still reports the true end time.
            for (let i = 0; i < blocks.length - 1; i++) {
              const gap = blocks[i + 1].startMinute - blocks[i].startMinute;
              blocks[i].drawMinutes = Math.min(blocks[i].slotMinutes, gap);
            }
            return { label, blocks };
          }),
      };
    });
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
