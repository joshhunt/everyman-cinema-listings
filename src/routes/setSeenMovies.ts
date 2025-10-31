import type { Request, Response } from "express";
import { getSeenMovieIds } from "../lib/cookies.ts";

export function setSeenMovies(req: Request, res: Response) {
  let seenMovieIds = getSeenMovieIds(req);

  const movieId = req.query.movieId;
  if (!movieId) {
    res.status(400).send("No movie ID provided");
    return;
  }

  // Add new ID if not already present
  if (!seenMovieIds.includes(String(movieId))) {
    seenMovieIds.push(String(movieId));
  } else {
    seenMovieIds = seenMovieIds.filter((id) => id !== String(movieId));
  }

  // Set updated cookie
  res.cookie("seenMovieIds", seenMovieIds.join(","), {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    httpOnly: true,
  });

  // Redirect back to homepage
  res.redirect("/");
  return;
}
