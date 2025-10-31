import type { Request } from "express";
import {
  DAYS_AHEAD_TO_SEARCH,
  DEFAULT_THEATRED_RANKED,
} from "../../commonValues.ts";

export function getSeenMovieIds(req: Request): string[] {
  const existingCookie: string = req.cookies?.seenMovieIds || "";
  return existingCookie ? existingCookie.split(",") : [];
}

export function getDaysAhead(req: Request): number {
  const existingCookie: string = req.cookies?.daysAhead || "";
  return existingCookie ? parseInt(existingCookie) : DAYS_AHEAD_TO_SEARCH;
}

export function getTheaters(req: Request): string[] {
  const existingCookie: string = req.cookies?.theaters || "";
  return existingCookie ? existingCookie.split(",") : DEFAULT_THEATRED_RANKED;
}
