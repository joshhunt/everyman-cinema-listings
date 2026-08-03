import { html, layout, type Html } from "./layout.ts";
import { settingsFooter } from "./settings.ts";
import type { ByMovieTheater, ScreeningView, Snapshot } from "../everyman/service.ts";
import type { Prefs } from "../prefs.ts";

function screeningLink(screening: ScreeningView): Html {
  const classes = ["action-link", "time-slot", screening.almostFull ? "almost-full" : ""].join(" ");
  const title = screening.badges.join(", ");
  return html`<a class="${classes}" href="${screening.url ?? "#"}" title="${title}"
    >${screening.time}${screening.badges.length > 0 ? html`<sup class="time-flag">*</sup>` : ""}</a
  >`;
}

export function byMoviePage(
  snapshot: Snapshot,
  theaters: ByMovieTheater[],
  prefs: Prefs,
  connected: boolean,
): Html {
  const body = html`
    <div class="theater-list">
      ${theaters.map(
        (theaterView) => html`
          <div class="theater-section">
            <h2 class="theater-name">${theaterView.theater.name}</h2>
            ${theaterView.movies.map(
              (movieView) => html`
                <div
                  class="movie-card show-on-hover-source ${movieView.seen ? "is-seen is-collapsed" : ""} ${movieView.collapsed ? "is-collapsed" : ""}"
                  data-movie-id="${movieView.movie.id}"
                >
                  <div class="movie-header">
                    <h3 class="movie-title">
                      <a href="${movieView.movieUrl}" target="_blank" rel="noreferrer">${movieView.movie.title}</a>
                    </h3>

                    <a
                      href="/set-seen?movieId=${movieView.movie.id}"
                      class="toggle-link show-on-hover hide-on-collapsed js-mark-seen"
                    >
                      [${movieView.seen ? "unsee" : "seen"}]
                    </a>

                    <button class="toggle-button js-toggle-collapsed" aria-label="Toggle movie details">
                      <span class="toggle-icon"></span>
                    </button>
                  </div>

                  <table class="screenings-table hide-on-collapsed" border="0" cellpadding="0" cellspacing="0">
                    <tbody>
                      ${movieView.days.map(
                        (day) => html`
                          <tr>
                            <td class="date-cell">${day.label}</td>
                            <td class="times-cell">${day.screenings.map(screeningLink)}</td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                </div>
              `,
            )}
          </div>
        `,
      )}
    </div>
    ${settingsFooter(snapshot, prefs, "/", connected)}
  `;

  return layout({ title: "Everyman listings — by film", activeTab: "by-movie", body });
}
