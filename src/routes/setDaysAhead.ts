import type { Request, Response } from "express";

export function setDaysAhead(req: Request, res: Response) {
  const daysAhead = req.query.days;

  if (!daysAhead) {
    res.status(400).send("No days ahead provided");
    return;
  }

  if (isNaN(Number(daysAhead))) {
    res.status(400).send("Invalid days ahead provided");
    return;
  }

  res.cookie("daysAhead", daysAhead, {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    httpOnly: true,
  });

  res.redirect("/");
}