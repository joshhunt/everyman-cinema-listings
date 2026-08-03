export const config = {
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? "info",
  cacheDir: process.env.CACHE_DIR ?? ".cache",

  /** Where this app is reachable, used by the connect bookmarklet. */
  siteOrigin: process.env.SITE_ORIGIN ?? `http://localhost:${process.env.PORT ?? 3000}`,

  // How far ahead we fetch schedules from the upstream API. Users slice this
  // window with the days-ahead setting, so it must cover the largest option.
  scheduleWindowDays: 78,

  siteHashFreshMs: 60 * 60 * 1000, // 1h
  staticQueriesFreshMs: 12 * 60 * 60 * 1000, // 12h
  scheduleFreshMs: 15 * 60 * 1000, // 15m
} as const;

export const CIRCUIT_ID = 101077;
export const WEBSITE_ID =
  "V2Vic2l0ZU1hbmFnZXJXZWJzaXRlOmIyNWQwN2RkLTczYTYtNDg1Ny1iODAzLWZiMmMyM2NiYjFkYQ==";

export const EVERYMAN_WWW = "https://www.everymancinema.com";
export const PURCHASE_BASE = "https://purchase.everymancinema.com";
export const CMS_ASSETS_BASE = "https://cms-assets.webediamovies.pro/prod/everyman";

/**
 * The loyalty circuit, which is a different id from the box office circuit
 * above. Taken from the site's own loyalty settings.
 */
export const LOYALTY_CIRCUIT_ID = "180";

const STRATFORD = "G029X";
const KINGS_CROSS = "X0X5P";
const BROADGATE = "X11NT";
const CANARY_WHARF = "X0VPB";

export const DEFAULT_THEATERS_RANKED: string[] = [
  STRATFORD,
  BROADGATE,
  KINGS_CROSS,
  CANARY_WHARF,
];

export const DEFAULT_DAYS_AHEAD = 21;

export const DAYS_AHEAD_OPTIONS = [
  { days: 7, label: "7d" },
  { days: 14, label: "2w" },
  { days: 21, label: "3w" },
  { days: 35, label: "5w" },
  { days: 56, label: "8w" },
  { days: 70, label: "10w" },
] as const;
