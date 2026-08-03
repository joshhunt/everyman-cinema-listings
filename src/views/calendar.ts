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
      <span class="cal-block-line">
        <span class="cal-block-title">${block.movie.title}</span>
        <span class="cal-block-time">${block.filmStartTime}</span>
      </span>
      ${block.badges.length > 0
        ? html`<span class="cal-block-line cal-block-badges">
            ${block.badges.map((badge) => html`<span class="badge">${badge}</span>`)}
          </span>`
        : ""}
    </span>
  </a>`;
}

export function calendarPage(
  snapshot: Snapshot,
  days: CalendarDay[],
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
    ${settingsFooter(snapshot, prefs, `/screen/${selectedTheater.id}`, connected)}
  `;

  return layout({
    title: `Everyman ${selectedTheater.name} — by screen`,
    activeTab: "by-screen",
    body,
    theaterId: selectedTheater.id,
  });
}
