const DAYS_AHEAD_TO_SEARCH = 21;

const CIRCUIT_ID = 101077;
const STRAFORD_THEATER_ID = "G029X";
const KINGS_CROSS_THEATER_ID = "X0X5P";
const BROADGATE_THEATER_ID = "X11NT";
const CANARY_WHARF_THEATER_ID = "X0VPB";

const dateStart = new Date();
const dateEnd = new Date(dateStart);

// Get to at least 14 days ahead
dateEnd.setDate(dateEnd.getDate() + DAYS_AHEAD_TO_SEARCH);

// Find next Tuesday (2 = Tuesday)
while (dateEnd.getDay() !== 2) {
  dateEnd.setDate(dateEnd.getDate() + 1);
}

// Set to end of day
dateEnd.setHours(23, 59, 59, 999);
dateStart.setHours(0, 0, 0, 0);

export const DEFAULT_DATE_START = dateStart;
export const DEFAULT_DATE_END = dateEnd;

export const DEFAULT_THEATRED_RANKED = [
  STRAFORD_THEATER_ID,
  KINGS_CROSS_THEATER_ID,
  BROADGATE_THEATER_ID,
  CANARY_WHARF_THEATER_ID,
];
