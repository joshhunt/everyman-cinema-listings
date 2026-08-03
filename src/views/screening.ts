import { html, type Html } from "./layout.ts";
import type { ScreeningView } from "../everyman/service.ts";

/**
 * A bookable time with its tags. Shared by every list view so a screening looks
 * the same wherever it appears.
 */
export function screeningLink(screening: ScreeningView): Html {
  const classes = ["action-link", "time-slot", screening.almostFull ? "almost-full" : ""].join(" ");
  return html`<span class="time-group"
    ><a class="${classes}" href="${screening.url ?? "#"}"
      >${screening.time}</a
    >${screening.badges.map((badge) => html`<span class="badge">${badge}</span>`)}</span
  >`;
}
