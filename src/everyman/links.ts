import { PURCHASE_BASE } from "../config.ts";
import type { ScreeningTicketing } from "./types.ts";

/**
 * Booking, and why it is not a plain link to the URL the schedule API gives us.
 *
 * The API gives `purchase.everymancinema.com/launch/ticketing/<id>`. Opening
 * that always lands logged out — the purchase site only accepts a member
 * session when it arrives on the `/api/launch/ticketing/redirect/<id>` path
 * with `?requestData=<session token>`, which is exactly what everymancinema.com
 * renders once you are signed in.
 *
 * We can't read their token from our own origin, so it is handed over once by
 * the connect bookmarklet and kept server-side. Links therefore point at our
 * own `/book/<id>`, which attaches a freshly-refreshed token at click time.
 * That keeps the token out of the HTML (and out of Referer headers), and means
 * a single redirect instead of everymancinema.com's five-second interstitial.
 */

/** The showtime id from a ticketing URL, e.g. ".../launch/ticketing/<id>". */
export function showtimeId(ticketing: ScreeningTicketing[]): string | undefined {
  const desktop = ticketing.find((t) => t.type === "DESKTOP") ?? ticketing[0];
  const url = desktop?.urls[0];
  if (!url) return undefined;

  const match = url.match(/\/launch\/ticketing\/([A-Za-z0-9-]+)/);
  return match?.[1];
}

/** Where /book/<id> sends the browser. */
export function ticketingRedirect(id: string, token: string | undefined): string {
  if (!token) {
    // Not connected: the logged-out flow, same as before.
    return `${PURCHASE_BASE}/launch/ticketing/${encodeURIComponent(id)}`;
  }
  const params = new URLSearchParams({ requestData: token });
  return `${PURCHASE_BASE}/api/launch/ticketing/redirect/${encodeURIComponent(id)}?${params}`;
}
