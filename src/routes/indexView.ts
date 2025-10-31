import { type Request, type Response } from "express";
import { getDaysAhead, getSeenMovieIds, getTheaters } from "../lib/cookies.ts";
import { type ScreeningsQuery, fetchMovieData, Timer } from "../../data.ts";
import { dateFormatter, DAYS_AHEAD_OPTIONS } from "../../commonValues.ts";

export async function indexView(req: Request, res: Response) {
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

  const {
    screenings,
    theaters,
    staticSiteHashCreatedAt,
    staticQueriesCreatedAt,
    boxOfficeScheduleCreatedAt,
  } = await fetchMovieData(query);

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
}

function getFollowingTuesday(date: Date) {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + 1);
  while (newDate.getDay() !== 2) {
    newDate.setDate(newDate.getDate() + 1);
  }
  return newDate;
}
