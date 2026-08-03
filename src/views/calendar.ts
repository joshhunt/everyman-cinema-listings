import { html, layout, type Html } from "./layout.ts";
import { settingsFooter } from "./settings.ts";
import { ADS_MINUTES, type CalendarBlock, type CalendarDay, type Snapshot } from "../everyman/service.ts";
import type { Prefs } from "../prefs.ts";
import type { TheaterNode } from "../everyman/types.ts";

function blockTitle(block: CalendarBlock): string {
  const parts = [
    `${block.movie.title}`,
    `doors ${block.listedTime}`,
    `film starts ${block.filmStartTime}`,
    block.estimated
      ? `ends ~${block.endTime} (estimated)`
      : `ends ${block.endTime} (${block.runtimeMinutes} min film)`,
  ];
  if (block.almostFull) parts.push("almost full");
  if (block.badges.length > 0) parts.push(block.badges.join(", "));
  return parts.join(" · ");
}

function blockEl(block: CalendarBlock, axisStart: number): Html {
  const classes = [
    "cal-block",
    block.seen ? "is-seen" : "",
    block.almostFull ? "almost-full" : "",
    block.estimated ? "is-estimated" : "",
  ].join(" ");

  // Position and width are driven by minutes; CSS turns them into pixels.
  const style = `--from:${block.startMinute - axisStart};--span:${block.drawMinutes};--ads:${ADS_MINUTES}`;

  return html`<a
    class="${classes}"
    style="${style}"
    href="${block.bookUrl ?? "#"}"
    title="${blockTitle(block)}"
  >
    <span class="cal-ads" aria-hidden="true"></span>
    <span class="cal-block-body">
      <span class="cal-block-title">${block.movie.title}</span>
      <span class="cal-block-time">${block.filmStartTime}</span>
    </span>
  </a>`;
}

export function calendarPage(
  snapshot: Snapshot,
  days: CalendarDay[],
  selectedTheater: TheaterNode,
  prefs: Prefs,
  connected: boolean,
  runtimesKnown: number,
): Html {
  const selectedTheaters = prefs.theaters
    .map((id) => snapshot.theaters.find((t) => t.id === id))
    .filter((t) => t !== undefined);

  const body = html`
    <nav class="cinema-tabs">
      ${selectedTheaters.map(
        (theater) => html`<a
          href="/calendar/${theater.id}"
          class="cinema-tab ${theater.id === selectedTheater.id ? "active" : ""}"
          >${theater.name}</a
        >`,
      )}
    </nav>

    <p class="cal-legend">
      The hatched band is the ${ADS_MINUTES} minutes of ads and trailers, so the time on each
      block is when the film actually starts.
      ${runtimesKnown > 0
        ? html`Blocks run ${ADS_MINUTES} min + the film's runtime, looked up on TMDB. A
            <span class="cal-swatch is-estimated"></span> dashed edge means TMDB has no runtime for
            it, so the length is estimated from the schedule instead.`
        : html`Lengths are estimated from the schedule — set
            <code>TMDB_READ_API_KEY</code> for exact runtimes.`}
    </p>

    <div class="cal-days">
      ${days.length === 0
        ? html`<p class="empty-note">No screenings in the selected window.</p>`
        : days.map(
            (day) => html`
              <section class="cal-day">
                <h2 class="day-name">
                  ${day.relative ? html`<span class="day-relative">${day.relative}</span> · ` : ""}${day.label}
                </h2>

                <div class="cal-scroll">
                  <div class="cal-grid" style="--span-total:${day.axisEnd - day.axisStart}">
                    <div class="cal-axis">
                      ${day.hours.map(
                        (hour) => html`<span class="cal-hour" style="--from:${hour.minute - day.axisStart}"
                          >${hour.label}</span
                        >`,
                      )}
                    </div>

                    ${day.screens.map(
                      (screen) => html`
                        <div class="cal-row">
                          <div class="cal-row-name">${screen.label}</div>
                          <div class="cal-lane">
                            ${day.nowMinute !== undefined
                              ? html`<span class="cal-now" style="--from:${day.nowMinute - day.axisStart}"></span>`
                              : ""}
                            ${screen.blocks.map((block) => blockEl(block, day.axisStart))}
                          </div>
                        </div>
                      `,
                    )}
                  </div>
                </div>
              </section>
            `,
          )}
    </div>
    ${settingsFooter(snapshot, prefs, `/calendar/${selectedTheater.id}`, connected)}
  `;

  return layout({
    title: `Everyman ${selectedTheater.name} — calendar`,
    activeTab: "calendar",
    body,
  });
}
