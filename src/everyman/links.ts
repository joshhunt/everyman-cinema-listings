import { EVERYMAN_WWW, PURCHASE_HOST } from "../config.ts";
import type { ScreeningTicketing } from "./types.ts";

/**
 * Build a booking link that keeps the user's Everyman login.
 *
 * Linking straight to purchase.everymancinema.com always lands logged-out:
 * the purchase site only knows about the session when the www site appends
 * the member token (?requestData=...) at click time, which it does from
 * client-side state we can't reach from another origin.
 *
 * The www app has a redirect hook that runs on every page: given
 * ?return=<path>, it validates the stored member token and forwards to
 * <ticketingUrl><path> with the token attached. Landing it on /login means
 * logged-out users authenticate first and are then forwarded too.
 */
export function bookingUrl(
  ticketing: ScreeningTicketing[],
  mode: "keep-login" | "direct",
): string | undefined {
  const desktop = ticketing.find((t) => t.type === "DESKTOP") ?? ticketing[0];
  const direct = desktop?.urls[0];
  if (!direct) return undefined;

  if (mode === "direct") return direct;

  try {
    const url = new URL(direct);
    if (url.hostname === PURCHASE_HOST) {
      return `${EVERYMAN_WWW}/login/?return=${encodeURIComponent(url.pathname)}`;
    }
  } catch {
    // fall through to the raw url
  }
  return direct;
}
