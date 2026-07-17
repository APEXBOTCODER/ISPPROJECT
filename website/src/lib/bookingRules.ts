// Shared booking rules used by both the client wizard and the server action.
// No server-only imports so it is safe to use in a "use client" component.

/** Minimum booking length: weekends (Sat/Sun) require more than weekdays. */
export const WEEKDAY_MIN_HOURS = 2;
export const WEEKEND_MIN_HOURS = 4;

export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00`).getDay(); // 0=Sun … 6=Sat
  return day === 0 || day === 6;
}

/** Minimum bookable hours for one date. */
export function minHoursForDate(date: string): number {
  return isWeekend(date) ? WEEKEND_MIN_HOURS : WEEKDAY_MIN_HOURS;
}

/** Strictest minimum across a set of dates (weekend wins). */
export function minHoursForDates(dates: string[]): number {
  return dates.reduce((m, d) => Math.max(m, minHoursForDate(d)), WEEKDAY_MIN_HOURS);
}

export const MIN_DURATION_MESSAGE = `Minimum booking is ${WEEKDAY_MIN_HOURS} hours on weekdays and ${WEEKEND_MIN_HOURS} hours on weekends.`;

/**
 * Current date + hour in the park's timezone, computed the same way on the
 * client and server so "today's" past hours are hidden regardless of the
 * visitor's own timezone.
 */
export function parkNowParts(timeZone = "America/Chicago"): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some runtimes render midnight as 24
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour };
}
