import type { Request, Response } from "express";
import { getTheaters } from "../lib/cookies.ts";

export function setTheaters(req: Request, res: Response) {
  let theaters = getTheaters(req);
  const theaterId = req.query.theaterId;

  if (!theaterId) {
    res.status(400).send("No theater ID provided");
    return;
  }

  // Remove theater if it exists, otherwise add it
  if (theaters.includes(String(theaterId))) {
    theaters = theaters.filter((id) => id !== String(theaterId));
  } else {
    theaters.push(String(theaterId));
  }

  res.cookie("theaters", theaters.join(","), {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    httpOnly: true,
  });

  res.redirect("/");
}
