import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { fetchMovieData, Timer, type ScreeningsQuery } from "./data.ts";
import { create } from "express-handlebars";
import {
  DEFAULT_THEATRED_RANKED,
  DAYS_AHEAD_TO_SEARCH,
  dateFormatter,
  dateTimeFormatter,
  timeFormatter,
} from "./commonValues.ts";

const app = express();
app.use(cookieParser());

const hbs = create({
  // Specify helpers which are only registered on this instance.
  helpers: {
    space(str: string) {
      return " ".repeat("12:00 pm".length - str.length);
    },
    formatDate(date: Date) {
      return dateFormatter.format(date);
    },
    formatTime(date: Date) {
      return timeFormatter.format(date);
    },
    formatDateTime(date: Date) {
      return dateTimeFormatter.format(date);
    },
  },
});

app.engine("handlebars", hbs.engine);
app.set("view engine", "handlebars");
app.set("views", "./views");
app.use(express.static("./views"));

const port = process.env.PORT || 3000;

function getSeenMovieIds(req: Request): string[] {
  const existingCookie: string = req.cookies?.seenMovieIds || "";
  return existingCookie ? existingCookie.split(",") : [];
}

function getDaysAhead(req: Request): number {
  const existingCookie: string = req.cookies?.daysAhead || "";
  return existingCookie ? parseInt(existingCookie) : DAYS_AHEAD_TO_SEARCH;
}

function getTheaters(req: Request): string[] {
  const existingCookie: string = req.cookies?.theaters || "";
  return existingCookie ? existingCookie.split(",") : DEFAULT_THEATRED_RANKED;
}

app.get("/set-theater", (req, res) => {
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
});

app.get("/set-days-ahead", (req, res) => {
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
});

app.get("/set-seen", (req, res) => {
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
});

const DAYS_AHEAD_OPTIONS = [
  { days: 7, label: "7d" },
  { days: 14, label: "2w" },
  { days: 21, label: "3w" },
  { days: 35, label: "5w" },
  { days: 56, label: "8w" },
  { days: 70, label: "10w" },
];

function getFollowingTuesday(date: Date) {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + 1);
  while (newDate.getDay() !== 2) {
    newDate.setDate(newDate.getDate() + 1);
  }
  return newDate;
}

app.get(
  "/",
  wrapErrors(async (req, res) => {
    const seenMovieIds = getSeenMovieIds(req);
    const daysAhead = getDaysAhead(req);
    const selectedTheaters = getTheaters(req);

    const dateStart = new Date();
    const dateEnd = getFollowingTuesday(new Date());
    dateEnd.setDate(dateEnd.getDate() + daysAhead);

    // Set time boundaries
    dateEnd.setHours(23, 59, 59, 999);
    dateStart.setHours(0, 0, 0, 0);

    const query: ScreeningsQuery = {
      fromDate: dateStart,
      toDate: dateEnd,
      theaters: selectedTheaters,
    };

    const movieDataTimer = new Timer();

    const {
      screenings,
      theaters,
      staticSiteHashCreatedAt,
      staticQueriesCreatedAt,
      boxOfficeScheduleCreatedAt,
    } = await fetchMovieData(query);

    console.log(`Movie data: ${movieDataTimer.getElapsed()}ms`);

    const processedMovieData = screenings.map((theater) => {
      return {
        ...theater,
        movies: theater.movies
          .map((movie) => {
            const seen = seenMovieIds.includes(movie.movieId);
            const collapse = seen || movie.isAtEarlierTheater;

            return { ...movie, seen, collapse };
          })
          .filter((movie) => {
            const shouldHide = movie.seen && movie.isAtEarlierTheater;
            return !shouldHide;
          })
          .toSorted((a, b) => {
            const aValue = a.seen ? 2 : a.isAtEarlierTheater ? 1 : -1;
            const bValue = b.seen ? 2 : b.isAtEarlierTheater ? 1 : -1;

            return aValue - bValue;
          }),
      };
    });

    const daysAheadOptions = DAYS_AHEAD_OPTIONS.map((option) => {
      const dateEnd = getFollowingTuesday(new Date());
      dateEnd.setDate(dateEnd.getDate() + option.days);

      return {
        ...option,
        selected: option.days === daysAhead,
        label: `${option.label} (${dateFormatter.format(dateEnd)})`,
      };
    });

    const theatersWithPref = theaters
      .map((theater) => {
        return {
          ...theater,
          selected: selectedTheaters.includes(theater.id),
        };
      })
      .toSorted((a, b) => {
        const aRank = selectedTheaters.indexOf(a.id);
        const bRank = selectedTheaters.indexOf(b.id);

        const aValue = aRank === -1 ? 999 : aRank;
        const bValue = bRank === -1 ? 999 : bRank;

        return aValue - bValue;
      });

    res.render("movieListings", {
      screenings: processedMovieData,
      staticSiteHashCreatedAt,
      staticQueriesCreatedAt,
      boxOfficeScheduleCreatedAt,
      daysAhead,
      daysAheadOptions,
      theaters: theatersWithPref,
    });
  })
);

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

function wrapErrors(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error: any) {
      console.error(error);
      res
        .status(500)
        .contentType("text/plain")
        .send(`Error: ${error.message ?? error.toString()}`);
    }
  };
}
