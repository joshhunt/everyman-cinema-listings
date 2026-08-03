import { html, layout, type Html } from "./layout.ts";
import { settingsFooter } from "./settings.ts";
import type { ByDayDay, ScreeningView, Snapshot } from "../everyman/service.ts";
import type { Prefs } from "../prefs.ts";
import type { TheaterNode } from "../everyman/types.ts";

function screeningLink(screening: ScreeningView): Html {
  const classes = ["action-link", "time-slot", screening.almostFull ? "almost-full" : ""].join(" ");
  return html`<span class="time-group"
    ><a class="${classes}" href="${screening.url ?? "#"}">${screening.time}</a
    >${screening.badges.map((badge) => html`<span class="badge">${badge}</span>`)}</span
  >`;
}

export function byDayPage(
  snapshot: Snapshot,
  days: ByDayDay[],
  selectedTheater: TheaterNode,
  prefs: Prefs,
  connected: boolean,
): Html {
  const selectedTheaters = prefs.theaters
    .map((id) => snapshot.theaters.find((t) => t.id === id))
    .filter((t) => t !== undefined);

  const body = html`
    <nav class="cinema-tabs">
      ${selectedTheaters.map(
        (theater) => html`<a
          href="/day/${theater.id}"
          class="cinema-tab ${theater.id === selectedTheater.id ? "active" : ""}"
          >${theater.name}</a
        >`,
      )}
    </nav>

    <div class="day-list">
      ${days.length === 0
        ? html`<p class="empty-note">No screenings in the selected window.</p>`
        : days.map(
            (day) => html`
              <section class="day-section">
                <h2 class="day-name">
                  ${day.relative ? html`<span class="day-relative">${day.relative}</span> · ` : ""}${day.label}
                </h2>
                <table class="day-table" border="0" cellpadding="0" cellspacing="0">
                  <tbody>
                    ${day.movies.map(
                      (movieView) => html`
                        <tr class="${movieView.seen ? "is-seen" : ""}">
                          <td class="day-movie-cell">
                            <a class="day-movie-title" href="${movieView.movieUrl}" target="_blank" rel="noreferrer"
                              >${movieView.movie.title}</a
                            >
                            ${movieView.movie.genres
                              ? html`<span class="day-movie-meta">${movieView.movie.genres.split(",")[0].trim().toLowerCase()}</span>`
                              : ""}
                          </td>
                          <td class="times-cell">${movieView.screenings.map(screeningLink)}</td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </section>
            `,
          )}
    </div>
    ${settingsFooter(snapshot, prefs, `/day/${selectedTheater.id}`, connected)}
  `;

  return layout({
    title: `Everyman ${selectedTheater.name} — by day`,
    activeTab: "by-day",
    body,
  });
}
