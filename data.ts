import { writeFile } from "fs/promises";
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

const CIRCUIT_ID = 101077;
const WEBSITE_ID =
  "V2Vic2l0ZU1hbmFnZXJXZWJzaXRlOmIyNWQwN2RkLTczYTYtNDg1Ny1iODAzLWZiMmMyM2NiYjFkYQ==";

const HASH_REGEX =
  /cms\-assets\.webediamovies\.pro\/prod\/everyman\/([A-z0-9]+)\/public/;

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hourCycle: "h12",
  hour: "numeric",
  minute: "numeric",
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const cache = new Cache("everyman-cinema-listings");

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

async function getStaticSiteHash(): Promise<string> {
  const cached = await cache.get("static-site-hash");
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

  await cache.set("static-site-hash", staticSiteHash, ONE_DAY);
  return staticSiteHash;
}

async function getStaticQueries(
  staticSiteHash: string
): Promise<StaticQueries> {
  const cached = await cache.get(`static-queries-${staticSiteHash}`);
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

  await cache.set(
    `static-queries-${staticSiteHash}`,
    allStaticQueries,
    TWO_DAYS
  );

  return allStaticQueries;
}

async function getMoviesMetadata(
  staticQueries: StaticQueries
): Promise<MovieNode[]> {
  const filmsQueryData: FilmsMetadataResponse | undefined = staticQueries.find(
    (v) => v.data?.allMovie?.nodes?.length > 0
  );
  if (!filmsQueryData) {
    throw new Error("No film data found");
  }
  await writeDebug("responses/film-data.json", filmsQueryData);

  return filmsQueryData.data.allMovie.nodes;
}

async function getTheatersMetadata(
  staticQueries: StaticQueries
): Promise<TheaterNode[]> {
  const theatersQueryData: TheaterMetadataResponse | undefined =
    staticQueries.find(
      (v) => v.data?.allTheater?.nodes?.[0]?.__typename === "Theater"
    );
  if (!theatersQueryData) {
    throw new Error("No theater data found");
  }
  await writeDebug("responses/theater-data.json", theatersQueryData);

  return theatersQueryData.data.allTheater.nodes;
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

async function getBoxofficeAPISchedule(
  query: ScreeningsQuery,
  allMovieIds: string[]
): Promise<BoxOfficeScheduleResponse> {
  const cacheKey = JSON.stringify({
    query,
    allMovieIds,
  });

  const cached = await cache.get(cacheKey);
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

  await cache.set(cacheKey, screeningsByMovieByDayByTheater, ONE_HOUR);

  return screeningsByMovieByDayByTheater;
}

export interface ScreeningsQuery {
  fromDate: Date;
  toDate: Date;
  theaters: string[];
}

export async function fetchMovieData(query: ScreeningsQuery) {
  const staticSiteHash = await getStaticSiteHash();
  const staticQueries = await getStaticQueries(staticSiteHash);

  const [moviesMetadata, theatersMetadata] = await Promise.all([
    getMoviesMetadata(staticQueries),
    getTheatersMetadata(staticQueries),
  ]);

  const allMovieIds = moviesMetadata.map((v) => v.id);

  const seenMovies = new Set();
  const result = [];

  const screeningsByMovieByDayByTheater = await getBoxofficeAPISchedule(
    query,
    allMovieIds
  );

  for (const theaterData of screeningsByMovieByDayByTheater) {
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
      if (seenMovies.has(movieData.movieId)) {
        continue;
      }

      seenMovies.add(movieData.movieId);
      const movie = moviesMetadata.find((v) => v.id === movieData.movieId);

      if (!movie) {
        throw new Error(`Unable to find movie ${movieData.movieId}`);
      }

      const movieResult: MovieScreenings = {
        movieId: movie.id,
        movieUrl: `https://www.everymancinema.com${movie.path}`,
        title: movie.title,
        path: movie.path,
        days: movieData.days.map((dayData) => {
          const dayDate = new Date(dayData.day);

          return {
            formattedDate: dateFormatter.format(dayDate),
            screenings: dayData.screenings.map((screening) => ({
              formattedTime: timeFormatter.format(new Date(screening.startsAt)),
              url: screening.data.ticketing[0].urls[0],
            })),
          };
        }),
      };

      theaterResult.movies.push(movieResult);
    }

    result.push(theaterResult);
  }

  return result;
}

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
  days: DayScreenings[];
}

export interface DayScreenings {
  formattedDate: string;
  screenings: Screening[];
}

export interface Screening {
  formattedTime: string;
  url: string;
}
