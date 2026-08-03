// Trimmed types for the upstream Everyman/Webedia APIs — only the fields we
// actually consume. The full payloads carry far more.

export interface FilmListingPageData {
  staticQueryHashes: string[];
}

export type StaticQuery = { data?: Record<string, unknown> };

export interface MovieNode {
  id: string;
  path: string;
  title: string;
  certificate: string | null;
  genres: string;
  runtime: number | null;
  release: string | null;
}

export interface TheaterNode {
  __typename: "Theater";
  id: string;
  path: string;
  name: string;
  timeZone: string;
}

export interface ScreeningTicketing {
  urls: string[];
  type: string;
  provider: string;
}

export interface UpstreamScreening {
  id: string;
  /** Wall-clock local time, no timezone offset, e.g. "2026-08-03T14:15:00" */
  startsAt: string;
  tags: string[];
  isExpired: boolean;
  data: { ticketing: ScreeningTicketing[] };
  occupancy?: { rate: number };
}

/** Response of the box office schedule API, keyed by theater id. */
export type ScheduleResponse = {
  [theaterId: string]: {
    /** movieId -> day (YYYY-MM-DD) -> screenings */
    schedule: { [movieId: string]: { [day: string]: UpstreamScreening[] } };
  };
};
