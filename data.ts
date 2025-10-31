import { writeFile } from "fs/promises";
import opentelemetry, { type Context, type Span } from "@opentelemetry/api";
import * as cheerio from "cheerio";
import type {
  FilmsMetadataResponse,
  MovieNode,
  TheaterMetadataResponse,
  TheaterNode,
  FilmListingPageData,
  ScheduleResponse,
  Schedule,
} from "./types.ts";
import Cache from "@joshhunt/fs-cache";
import { timeFormatter } from "./commonValues.ts";
import { traced } from "./src/lib/otel.ts";

const CIRCUIT_ID = 101077;
const WEBSITE_ID =
  "V2Vic2l0ZU1hbmFnZXJXZWJzaXRlOmIyNWQwN2RkLTczYTYtNDg1Ny1iODAzLWZiMmMyM2NiYjFkYQ==";

const HASH_REGEX =
  /cms\-assets\.webediamovies\.pro\/prod\/everyman\/([A-z0-9\-]+)\/public/;

interface CachedValue<T> {
  key: string;
  createdAt: number;
  data: T;
}

export class Timer {
  private start: number;

  constructor() {
    this.start = Date.now();
  }

  getElapsed() {
    return Date.now() - this.start;
  }
}

const tracer = opentelemetry.trace.getTracer("data-lib", "0.1");

class ActiveSpan {
  span: opentelemetry.Span | null = null;
  ctx: Context | null = null;

  constructor(name: string) {
    this.span = null;

    tracer.startActiveSpan(name, (span) => {
      this.span = span;
      this.ctx = opentelemetry.trace.setSpan(
        opentelemetry.context.active(),
        span
      );
    });
  }

  // For sync cleanup
  [Symbol.dispose]() {
    this.span?.end();
  }

  // For async cleanup (if needed)
  async [Symbol.asyncDispose]() {
    this.span?.end();
  }

  get current() {
    return this.span;
  }
}

const cache = new Cache("everyman-cinema-listings");

function getCacheValue<T>(key: string): Promise<CachedValue<T> | undefined> {
  return withSpan("getCacheValue", async (span) => {
    span.setAttribute("cache.key", key);
    return cache.get(key);
  });
}

function setCacheValue<T>(key: string, data: T, ttl: number): Promise<void> {
  return withSpan("setCacheValue", async (span) => {
    span.setAttribute("cache.key", key);
    const obj: CachedValue<T> = {
      key,
      createdAt: Date.now(),
      data,
    };

    return cache.set(key, obj, ttl);
  });
}

function withSpan<T>(
  spanName: string,
  fn: (span: opentelemetry.Span) => T | Promise<T>
): Promise<T> {
  console.log(`Starting span: ${spanName}`);
  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      const result = await fn(span);
      console.log(`Ending span: ${spanName}`);
      span.end();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: opentelemetry.SpanStatusCode.ERROR });
      console.log(`Ending span with error: ${spanName}`);
      span.end();
      throw err;
    }
  });
}

async function writeDebug(path: string, data: any) {
  if (process.env.DEBUG) {
    await writeFile(path, JSON.stringify(data, null, 2));
  }
}

async function get(
  name: string,
  input: string | URL | globalThis.Request,
  init?: RequestInit
): Promise<any> {
  const res = await fetch(input, init);

  const isJSON = res.headers.get("content-type")?.includes("json");

  if (isJSON) {
    const json = await res.json();
    await writeDebug(`responses/${name}.json`, json);
    return json;
  }

  const text = await res.text();
  await writeDebug(`responses/${name}`, text);

  return text;
}

type StaticQueries = any[];

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = ONE_HOUR * 24;
const TWO_DAYS = ONE_DAY * 2;

async function getStaticSiteHash(): Promise<CachedValue<string>> {
  return withSpan("getStaticSiteHash", async (span) => {
    const cached = await getCacheValue<string>("static-site-hash");
    if (cached) {
      return cached;
    }

    const filmListingHTMLPage = await get(
      "film-listing-html-page",
      "https://www.everymancinema.com/film-listing/"
    );

    const $filmListingPage = cheerio.load(filmListingHTMLPage);
    const prefetchLinks = $filmListingPage("link");

    const staticSiteHash = prefetchLinks
      .map((index, el) => {
        const href = el.attribs.href;
        const match = href.match(HASH_REGEX);
        if (match) {
          return match[1];
        }
      })
      .filter(Boolean)
      .get(0);

    if (!staticSiteHash) {
      throw new Error("No hash found");
    }

    await setCacheValue("static-site-hash", staticSiteHash, ONE_DAY);
    return getStaticSiteHash();
  });
}

async function getStaticQueries(
  staticSiteHash: string
): Promise<CachedValue<StaticQueries>> {
  return withSpan("getStaticQueries", async (span) => {
    const cached = await getCacheValue<StaticQueries>(
      `static-queries-${staticSiteHash}`
    );
    if (cached) {
      return cached;
    }

    const filmListingPageData: FilmListingPageData = await get(
      "film-listing-page-data",
      `https://cms-assets.webediamovies.pro/prod/everyman/${staticSiteHash}/public/page-data/film-listing/page-data.json`
    );

    const allStaticQueries: StaticQueries = await Promise.all(
      filmListingPageData.staticQueryHashes.map((hash) =>
        get(
          `film-listing-static-query-${hash}`,
          `https://cms-assets.webediamovies.pro/prod/everyman/${staticSiteHash}/public/page-data/sq/d/${hash}.json`
        )
      )
    );

    await setCacheValue(
      `static-queries-${staticSiteHash}`,
      allStaticQueries,
      TWO_DAYS
    );

    return getStaticQueries(staticSiteHash);
  });
}

async function getMoviesMetadata(
  staticQueries: StaticQueries
): Promise<MovieNode[]> {
  return withSpan("getMoviesMetadata", async (span) => {
    const filmsQueryData: FilmsMetadataResponse | undefined =
      staticQueries.find((v) => v.data?.allMovie?.nodes?.length > 0);
    if (!filmsQueryData) {
      throw new Error("No film data found");
    }
    await writeDebug("responses/film-data.json", filmsQueryData);

    return filmsQueryData.data.allMovie.nodes;
  });
}

async function getTheatersMetadata(
  staticQueries: StaticQueries
): Promise<TheaterNode[]> {
  return withSpan("getTheatersMetadata", async (span) => {
    const theatersQueryData: TheaterMetadataResponse | undefined =
      staticQueries.find(
        (v) => v.data?.allTheater?.nodes?.[0]?.__typename === "Theater"
      );
    if (!theatersQueryData) {
      throw new Error("No theater data found");
    }
    await writeDebug("responses/theater-data.json", theatersQueryData);

    return theatersQueryData.data.allTheater.nodes;
  });
}

type BoxOfficeScheduleResponse = {
  theaterId: string;
  movies: {
    movieId: string;
    days: {
      day: string;
      screenings: Schedule[];
    }[];
  }[];
}[];

async function getBoxOfficeAPISchedule(
  query: ScreeningsQuery,
  allMovieIds: string[]
): Promise<CachedValue<BoxOfficeScheduleResponse>> {
  return withSpan("getBoxOfficeAPISchedule", async (span) => {
    const cacheKey = JSON.stringify({
      query,
      allMovieIds,
    });

    const cached = await getCacheValue<BoxOfficeScheduleResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const schedule: ScheduleResponse = await get(
      "schedule",
      "https://www.everymancinema.com/api/gatsby-source-boxofficeapi/schedule",
      {
        body: JSON.stringify({
          circuit: CIRCUIT_ID,
          theaters: query.theaters.map((id) => ({
            id: id,
            timeZone: "Europe/London",
          })),
          movieIds: allMovieIds,
          from: query.fromDate.toISOString(),
          to: query.toDate.toISOString(),
          nin: [],
          sin: [],
          websiteId: WEBSITE_ID,
        }),
        method: "POST",
      }
    );

    await writeDebug("responses/schedule.json", schedule);

    const screeningsByMovieByDayByTheater = Object.entries(schedule)
      .map(([theaterId, screeningsForTheater]) => {
        const movies = Object.entries(screeningsForTheater.schedule).map(
          ([movieId, movieData]) => {
            const days = Object.entries(movieData).map(([day, dayShowings]) => {
              return {
                day,
                screenings: dayShowings,
              };
            });

            return {
              movieId,
              days,
            };
          }
        );

        movies.sort((a, b) => {
          const aFirstScreening = a.days[0]?.screenings[0]?.startsAt;
          const bFirstScreening = b.days[0]?.screenings[0]?.startsAt;

          if (!aFirstScreening) return 1;
          if (!bFirstScreening) return -1;

          return (
            new Date(aFirstScreening).getTime() -
            new Date(bFirstScreening).getTime()
          );
        });

        return {
          theaterId,
          movies,
        };
      })
      .sort((a, b) => {
        const aScore = query.theaters.indexOf(a.theaterId);
        const bScore = query.theaters.indexOf(b.theaterId);

        return aScore - bScore;
      });

    await writeDebug(
      "responses/screenings-by-movie-by-day-by-theater.json",
      screeningsByMovieByDayByTheater
    );

    await setCacheValue(cacheKey, screeningsByMovieByDayByTheater, ONE_HOUR);
    return getBoxOfficeAPISchedule(query, allMovieIds);
  });
}

export interface ScreeningsQuery {
  fromDate: Date;
  toDate: Date;
  theaters: string[];
}

export const fetchMovieData = traced(
  tracer,
  "fetchMovieData",
  async (query: ScreeningsQuery, span: Span) => {
    const { data: staticSiteHash, createdAt: staticSiteHashCreatedAtTs } =
      await getStaticSiteHash();

    const { data: staticQueries, createdAt: staticQueriesCreatedAtTs } =
      await getStaticQueries(staticSiteHash);

    const staticSiteHashCreatedAt = new Date(staticSiteHashCreatedAtTs);
    const staticQueriesCreatedAt = new Date(staticQueriesCreatedAtTs);

    const [moviesMetadata, theatersMetadata] = await Promise.all([
      getMoviesMetadata(staticQueries),
      getTheatersMetadata(staticQueries),
    ]);

    const allMovieIds = moviesMetadata.map((v) => v.id);

    const seenMovies = new Set();
    const result = [];

    const { data: boxOfficeSchedule, createdAt: boxOfficeScheduleCreatedAtTs } =
      await getBoxOfficeAPISchedule(query, allMovieIds);
    const boxOfficeScheduleCreatedAt = new Date(boxOfficeScheduleCreatedAtTs);

    for (const theaterData of boxOfficeSchedule) {
      const theater = theatersMetadata.find(
        (v) => v.id === theaterData.theaterId
      );

      if (!theater) {
        throw new Error(`Unable to find theater ${theaterData.theaterId}`);
      }

      const theaterResult: TheaterScreenings = {
        theaterName: theater.name,
        movies: [],
      };

      for (const movieData of theaterData.movies) {
        const isAtEarlierTheater = seenMovies.has(movieData.movieId);
        seenMovies.add(movieData.movieId);

        const movie = moviesMetadata.find((v) => v.id === movieData.movieId);

        if (!movie) {
          throw new Error(`Unable to find movie ${movieData.movieId}`);
        }

        const maxLengthByIndex = new Map<number, number>();

        const movieResult: MovieScreenings = {
          movieId: movie.id,
          movieUrl: `https://www.everymancinema.com${movie.path}`,
          title: movie.title,
          path: movie.path,
          isAtEarlierTheater,
          days: movieData.days.map((dayData) => {
            const dayDate = new Date(dayData.day);

            return {
              date: dayDate,
              screenings: dayData.screenings.map((screening, index) => {
                const time = new Date(screening.startsAt);
                const formattedTime = timeFormatter.format(time);
                maxLengthByIndex.set(
                  index,
                  Math.max(
                    maxLengthByIndex.get(index) ?? 0,
                    formattedTime.length
                  )
                );

                return {
                  time,
                  formattedTime,
                  url: screening.data.ticketing[0].urls[0],
                };
              }),
            };
          }),
        };

        for (const day of movieResult.days) {
          for (
            let screeningIndex = 0;
            screeningIndex < day.screenings.length;
            screeningIndex++
          ) {
            const screening = day.screenings[screeningIndex];
            const maxLength = maxLengthByIndex.get(screeningIndex) ?? 0;

            const paddingLength = maxLength - screening.formattedTime.length;
            const padding = "<span class='padding-zero'>0</span>".repeat(
              paddingLength
            );

            screening.formattedTime = padding + screening.formattedTime;
          }
        }

        theaterResult.movies.push(movieResult);
      }

      result.push(theaterResult);
    }

    return {
      screenings: result,
      staticSiteHashCreatedAt,
      staticQueriesCreatedAt,
      boxOfficeScheduleCreatedAt,
      theaters: theatersMetadata,
    };
  }
);

export interface TheaterScreenings {
  theaterName: string;
  movies: MovieScreenings[];
}

export interface MovieScreenings {
  title: string;
  movieId: string;
  movieUrl: string;
  path: string;
  seen?: boolean;
  isAtEarlierTheater: boolean;
  days: DayScreenings[];
}

export interface DayScreenings {
  date: Date;
  screenings: Screening[];
}

export interface Screening {
  time: Date;
  formattedTime: string;
  url: string;
}
