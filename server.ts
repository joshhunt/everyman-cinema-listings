import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { fetchMovieData, type ScreeningsQuery } from "./data.ts";
import { watch } from "fs";
import { readFile } from "fs/promises";
import { create } from "express-handlebars";
import {
  DEFAULT_DATE_START,
  DEFAULT_DATE_END,
  DEFAULT_THEATRED_RANKED,
} from "./commonValues.ts";

const app = express();
app.use(cookieParser());

const hbs = create({
  // Specify helpers which are only registered on this instance.
  helpers: {
    space(formattedTime: string) {
      return " ".repeat("12:00 pm".length - formattedTime.length);
    },
  },
});

app.engine("handlebars", hbs.engine);
app.set("view engine", "handlebars");
app.set("views", "./views");

const port = process.env.PORT || 3000;

const CSS_PATH = "./views/styles.css";
let css = await readFile(CSS_PATH, "utf-8");
watch(CSS_PATH, async (eventType, path) => {
  if (eventType === "change" && path) {
    css = await readFile(path, "utf-8");
  }
});

function getSeenMovieIds(req: Request) {
  const existingCookie: string = req.cookies?.seenMovieIds || "";
  return existingCookie ? existingCookie.split(",") : [];
}

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

app.get(
  "/",
  wrapErrors(async (req, res) => {
    const seenMovieIds = getSeenMovieIds(req);

    const query: ScreeningsQuery = {
      fromDate: DEFAULT_DATE_START,
      toDate: DEFAULT_DATE_END,
      theaters: DEFAULT_THEATRED_RANKED,
    };

    let dfdf: Boolean = true;

    const movieData = await fetchMovieData(query);

    const processedMovieData = movieData.map((theater) => {
      return {
        ...theater,
        movies: theater.movies
          .map((movie) => {
            return { ...movie, seen: seenMovieIds.includes(movie.movieId) };
          })
          .toSorted((a, b) => {
            const aValue = a.seen ? 1 : -1;
            const bValue = b.seen ? 1 : -1;

            return aValue - bValue;
          }),
      };
    });

    res.render("movieListings", {
      css,
      theaters: processedMovieData,
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
