// All upstream times are wall-clock strings in the cinema's timezone
// ("2026-08-03T14:15:00", day keys "2026-08-03"). We format them textually and
// never convert between timezones; "today" is computed in Europe/London.

const LONDON_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function todayISO(): string {
  return LONDON_DAY.format(new Date());
}

/** ISO day + n days, as ISO day. Interprets days as UTC dates throughout. */
export function addDays(isoDay: string, n: number): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** "Mon 3 Aug" */
export function formatDay(isoDay: string): string {
  return DAY_LABEL.format(new Date(`${isoDay}T00:00:00Z`));
}

/** "Today" / "Tomorrow" / weekday name, relative to London today. */
export function relativeDayName(isoDay: string): string | undefined {
  const today = todayISO();
  if (isoDay === today) return "Today";
  if (isoDay === addDays(today, 1)) return "Tomorrow";
  return undefined;
}

/** "2026-08-03T14:15:00" -> "2:15 pm" */
export function formatTime(startsAt: string): string {
  const [hoursStr, minutes] = startsAt.slice(11, 16).split(":");
  const hours = Number(hoursStr);
  const suffix = hours >= 12 ? "pm" : "am";
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes} ${suffix}`;
}

/**
 * End of the day `daysAhead` days after the next Tuesday, mirroring Everyman's
 * playweek boundary (new schedules appear on Tuesdays).
 */
export function windowEndISO(daysAhead: number): string {
  let day = todayISO();
  do {
    day = addDays(day, 1);
  } while (new Date(`${day}T00:00:00Z`).getUTCDay() !== 2);
  return addDays(day, daysAhead);
}
