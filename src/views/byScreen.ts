import { html, layout, type Html } from "./layout.ts";
import { settingsFooter } from "./settings.ts";
import type { ByScreenDay, ScreeningView, Snapshot } from "../everyman/service.ts";
import type { Prefs } from "../prefs.ts";
import type { TheaterNode } from "../everyman/types.ts";

function screeningLink(screening: ScreeningView): Html {
  const classes = ["action-link", "time-slot", screening.almostFull ? "almost-full" : ""].join(" ");
  const title = screening.badges.join(", ");
  return html`<a class="${classes}" href="${screening.url ?? "#"}" title="${title}"
    >${screening.time}${screening.badges.length > 0 ? html`<sup class="time-flag">*</sup>` : ""}</a
  >`;
}

export function byScreenPage(
  snapshot: Snapshot,
  days: ByScreenDay[],
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
          href="/screen/${theater.id}"
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
                <table class="screen-table" border="0" cellpadding="0" cellspacing="0">
                  <tbody>
                    ${day.screens.map(
                      (screen) => html`
                        <tr>
                          <td class="screen-name-cell">${screen.label}</td>
                          <td class="screen-programme-cell">
                            ${screen.blocks.map(
                              (block) => html`<span class="screen-block ${block.seen ? "is-seen" : ""}">
                                <a
                                  class="screen-block-title"
                                  href="${block.movieUrl}"
                                  target="_blank"
                                  rel="noreferrer"
                                  >${block.movie.title}</a
                                >
                                ${block.screenings.map(screeningLink)}
                              </span>`,
                            )}
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </section>
            `,
          )}
    </div>
    ${settingsFooter(snapshot, prefs, `/screen/${selectedTheater.id}`, connected)}
  `;

  return layout({
    title: `Everyman ${selectedTheater.name} — by screen`,
    activeTab: "by-screen",
    body,
  });
}
