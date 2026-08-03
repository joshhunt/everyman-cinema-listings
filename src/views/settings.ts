import { html, type Html } from "./layout.ts";
import { DAYS_AHEAD_OPTIONS } from "../config.ts";
import { formatDay, windowEndISO } from "../dates.ts";
import type { Prefs } from "../prefs.ts";
import type { Snapshot } from "../everyman/service.ts";

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h12",
  timeZone: "Europe/London",
});

export function settingsFooter(snapshot: Snapshot, prefs: Prefs, backTo: string): Html {
  const theaters = [...snapshot.theaters].sort((a, b) => {
    const aRank = prefs.theaters.indexOf(a.id);
    const bRank = prefs.theaters.indexOf(b.id);
    return (aRank === -1 ? 999 : aRank) - (bRank === -1 ? 999 : bRank);
  });

  const freshness = Object.entries(snapshot.fetchedAt).map(
    ([key, iso]) => html`<span class="freshness-item">${key}: ${TIME_FMT.format(new Date(iso))}</span>`,
  );

  return html`
    <table class="meta-table" border="0" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <th class="nowrap">Days ahead</th>
          <td>
            <div class="actions-list">
              ${DAYS_AHEAD_OPTIONS.map(
                (option) => html`<a
                  class="action-link ${option.days === prefs.daysAhead ? "selected" : ""}"
                  href="/set-days-ahead?days=${option.days}&back=${encodeURIComponent(backTo)}"
                  >${option.label} (${formatDay(windowEndISO(option.days))})</a
                >`,
              )}
            </div>
          </td>
        </tr>
        <tr>
          <th class="nowrap">Theatres</th>
          <td>
            <div class="actions-list">
              ${theaters.map(
                (theater) => html`<a
                  class="action-link ${prefs.theaters.includes(theater.id) ? "selected" : ""}"
                  href="/set-theater?theaterId=${theater.id}&back=${encodeURIComponent(backTo)}"
                  >${theater.name}</a
                >`,
              )}
            </div>
          </td>
        </tr>
        <tr>
          <th class="nowrap">Booking links</th>
          <td>
            <div class="actions-list">
              <a
                class="action-link ${prefs.linkMode === "keep-login" ? "selected" : ""}"
                href="/set-link-mode?mode=keep-login&back=${encodeURIComponent(backTo)}"
                title="Bounce through everymancinema.com so your membership login is kept"
                >keep me logged in</a
              >
              <a
                class="action-link ${prefs.linkMode === "direct" ? "selected" : ""}"
                href="/set-link-mode?mode=direct&back=${encodeURIComponent(backTo)}"
                title="Link straight to the ticketing site (always logged out)"
                >direct</a
              >
            </div>
          </td>
        </tr>
        <tr>
          <th class="nowrap">Data age</th>
          <td><div class="actions-list freshness">${freshness}</div></td>
        </tr>
      </tbody>
    </table>
  `;
}
