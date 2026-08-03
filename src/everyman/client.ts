import { createHash } from "node:crypto";
import {
  CIRCUIT_ID,
  CMS_ASSETS_BASE,
  EVERYMAN_WWW,
  WEBSITE_ID,
} from "../config.ts";
import { logger } from "../o11y/logger.ts";
import { upstreamFetchDuration, upstreamFetchErrors, withSpan } from "../o11y/otel.ts";
import type {
  FilmListingPageData,
  MovieNode,
  ScheduleResponse,
  StaticQuery,
  TheaterNode,
} from "./types.ts";

const log = logger.child({ module: "client" });

const HASH_REGEX = /cms-assets\.webediamovies\.pro\/prod\/everyman\/([A-Za-z0-9-]+)\/public/;

async function request<T>(resource: string, url: string, init?: RequestInit): Promise<T> {
  return withSpan(`everyman.${resource}`, { "http.url": url }, async () => {
    const start = performance.now();
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        throw new Error(`${resource}: HTTP ${res.status} from ${url}`);
      }
      const isJSON = res.headers.get("content-type")?.includes("json");
      return (isJSON ? await res.json() : await res.text()) as T;
    } catch (err) {
      upstreamFetchErrors.add(1, { resource });
      throw err;
    } finally {
      const seconds = (performance.now() - start) / 1000;
      upstreamFetchDuration.record(seconds, { resource });
      log.debug({ resource, url, seconds }, "upstream fetch");
    }
  });
}

/**
 * The Gatsby site's static assets live under a build-specific hash. It is
 * discoverable from any page's <link> tags.
 */
export async function fetchSiteHash(): Promise<string> {
  const html = await request<string>("site-hash", `${EVERYMAN_WWW}/film-listing/`);
  const match = html.match(HASH_REGEX);
  if (!match) {
    throw new Error("site hash not found in film-listing page");
  }
  return match[1];
}

/** All static query payloads for the film-listing page. */
export async function fetchStaticQueries(siteHash: string): Promise<StaticQuery[]> {
  const pageData = await request<FilmListingPageData>(
    "page-data",
    `${CMS_ASSETS_BASE}/${siteHash}/public/page-data/film-listing/page-data.json`,
  );

  return Promise.all(
    pageData.staticQueryHashes.map((hash) =>
      request<StaticQuery>(
        "static-query",
        `${CMS_ASSETS_BASE}/${siteHash}/public/page-data/sq/d/${hash}.json`,
      ),
    ),
  );
}

export function extractMovies(staticQueries: StaticQuery[]): MovieNode[] {
  for (const query of staticQueries) {
    const allMovie = query.data?.allMovie as { nodes?: MovieNode[] } | undefined;
    if (allMovie?.nodes?.length) {
      return allMovie.nodes;
    }
  }
  throw new Error("no movie metadata in static queries");
}

export function extractTheaters(staticQueries: StaticQuery[]): TheaterNode[] {
  for (const query of staticQueries) {
    const allTheater = query.data?.allTheater as { nodes?: TheaterNode[] } | undefined;
    if (allTheater?.nodes?.[0]?.__typename === "Theater") {
      return allTheater.nodes;
    }
  }
  throw new Error("no theater metadata in static queries");
}

/** Screenings for one theater over a date range, keyed movie -> day. */
export async function fetchSchedule(
  theaterId: string,
  timeZone: string,
  movieIds: string[],
  from: Date,
  to: Date,
): Promise<ScheduleResponse> {
  // Netlify's edge caches this POST varying only on the query string
  // (netlify-vary: query), so requests with different bodies but the same URL
  // collide and return each other's responses. Encode the distinguishing
  // fields in the query string to get a unique cache entry per request shape.
  const bodyKey = createHash("sha256")
    .update(JSON.stringify({ theaterId, movieIds, from, to }))
    .digest("hex")
    .slice(0, 16);
  const cacheBuster = new URLSearchParams({ theater: theaterId, v: bodyKey });

  const response = await request<ScheduleResponse>(
    "schedule",
    `${EVERYMAN_WWW}/api/gatsby-source-boxofficeapi/schedule?${cacheBuster}`,
    {
      method: "POST",
      body: JSON.stringify({
        circuit: CIRCUIT_ID,
        theaters: [{ id: theaterId, timeZone }],
        movieIds,
        from: from.toISOString(),
        to: to.toISOString(),
        nin: [],
        sin: [],
        websiteId: WEBSITE_ID,
      }),
    },
  );

  if (!(theaterId in response)) {
    throw new Error(
      `schedule: response for ${theaterId} contains ${Object.keys(response).join(",") || "nothing"}`,
    );
  }
  return response;
}
