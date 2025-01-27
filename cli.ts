import {
  DEFAULT_DATE_END,
  DEFAULT_DATE_START,
  DEFAULT_THEATRED_RANKED,
} from "./commonValues.ts";
import { fetchMovieData, type ScreeningsQuery } from "./data.ts";

function hyperlink(url: string, text: string) {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

const query: ScreeningsQuery = {
  fromDate: DEFAULT_DATE_START,
  toDate: DEFAULT_DATE_END,
  theaters: DEFAULT_THEATRED_RANKED,
};

fetchMovieData(query).then((listings) => {
  for (const theater of listings) {
    console.log(theater.theaterName);

    for (const movie of theater.movies) {
      console.log("  " + hyperlink(movie.movieUrl, movie.title));

      for (const day of movie.days) {
        const times = day.screenings.map(({ formattedTime, url }) => {
          return hyperlink(url, formattedTime);
        });

        console.log("    " + day.formattedDate + " - " + times.join(", "));
      }
    }
  }
});
