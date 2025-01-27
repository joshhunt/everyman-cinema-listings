import express from "express";
import cookieParser from "cookie-parser";
import {
  fetchMovieData,
  type TheaterScreenings,
  type MovieScreenings,
  type DayScreenings,
  type Screening,
  type ScreeningsQuery,
} from "./data.ts";
import { watch } from "fs";
import { readFile } from "fs/promises";
import {
  DEFAULT_DATE_START,
  DEFAULT_DATE_END,
  DEFAULT_THEATRED_RANKED,
} from "./commonValues.ts";

const app = express();
app.use(cookieParser());

const port = process.env.PORT || 3000;

const CSS_PATH = "styles.css";
let css = await readFile(CSS_PATH, "utf-8");
watch(CSS_PATH, async (eventType, path) => {
  if (eventType === "change" && path) {
    css = await readFile(path, "utf-8");
  }
});

app.get("/", async (req, res) => {
  // Get existing cookie value or initialize empty array
  const existingCookie: string = req.cookies?.seenMovieIds || "";
  let seenMovieIds = existingCookie ? existingCookie.split(",") : [];

  console.log({ seenMovieIds });

  const seenMovieId = req.query.seen;
  if (seenMovieId) {
    // Add new ID if not already present
    if (!seenMovieIds.includes(String(seenMovieId))) {
      seenMovieIds.push(String(seenMovieId));
    } else {
      seenMovieIds = seenMovieIds.filter((id) => id !== String(seenMovieId));
    }

    // Set updated cookie
    res.cookie("seenMovieIds", seenMovieIds.join(","), {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      httpOnly: true,
    });

    // Redirect back to homepage
    return res.redirect("/");
  }

  try {
    const query: ScreeningsQuery = {
      fromDate: DEFAULT_DATE_START,
      toDate: DEFAULT_DATE_END,
      theaters: DEFAULT_THEATRED_RANKED,
    };

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

    let html = `<html><head><title>Everyman Movie Listings</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap" rel="stylesheet">
    <style>
      ${css}
    </style></head><body>`;

    const maxTimes = movieData
      .flatMap((theater) =>
        theater.movies.flatMap((movie) =>
          movie.days.map((day) => day.screenings.length)
        )
      )
      .reduce((max, time) => Math.max(max, time), 0);

    const renderScreening = (screening: Screening) => {
      const paddingSpaces = " ".repeat(
        "12:00 pm".length - screening.formattedTime.length
      );
      return `<td class="pre-text">${paddingSpaces}<a href="${screening.url}">${screening.formattedTime}</a></td>`;
    };

    const renderDay = (day: DayScreenings) => `
                <tr class="screenings">
                  <td>${day.formattedDate}</td> ${day.screenings
      .map(renderScreening)
      .join(" ")}
                </tr>
              `;

    const renderMovie = (movie: MovieScreenings) => {
      return `
            <div class="movie">
              <details ${movie.seen ? "" : "open"}>
                <summary><h3><a href="https://www.everymancinema.com${
                  movie.path
                }">${movie.title}</a> <a class="seen-link" href="?seen=${
        movie.movieId
      }">[${movie.seen ? "unsee" : "seen"}]</a></h3></summary>
                <table>
                  <tbody>
                    ${movie.days.map(renderDay).join("")}
                  </tbody>
                </table>
              </details>
            </div>
          `;
    };

    const renderTheater = (theaterData: TheaterScreenings) => `
        <div class="theater">
          <h2>${theaterData.theaterName}</h2>
          ${theaterData.movies.map(renderMovie).join("")}
        </div>
      `;

    html += `
      ${processedMovieData.map(renderTheater).join("")}
    `;

    html += "</body></html>";
    res.send(html);
  } catch (error: any) {
    console.error(error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
