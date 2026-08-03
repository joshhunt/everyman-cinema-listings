import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { DEFAULT_DAYS_AHEAD, DEFAULT_THEATERS_RANKED } from "./config.ts";

export interface Prefs {
  /** Selected theater ids, in preference order. */
  theaters: string[];
  daysAhead: number;
  seenMovieIds: string[];
}

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function readPrefs(c: Context): Prefs {
  const theaters = getCookie(c, "theaters");
  const daysAhead = Number(getCookie(c, "daysAhead"));
  const seen = getCookie(c, "seenMovieIds");

  return {
    theaters: theaters ? theaters.split(",").filter(Boolean) : [...DEFAULT_THEATERS_RANKED],
    daysAhead: Number.isFinite(daysAhead) && daysAhead > 0 ? daysAhead : DEFAULT_DAYS_AHEAD,
    seenMovieIds: seen ? seen.split(",").filter(Boolean) : [],
  };
}

export function writePref(c: Context, name: string, value: string): void {
  setCookie(c, name, value, {
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  });
}
