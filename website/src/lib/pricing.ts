// Peak pricing: weekday evenings from 5pm, plus all day Saturday/Sunday.
// Hours and dates are park-local (America/Chicago).

export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

export function isPeakHour(date: string, hour: number): boolean {
  return isWeekend(date) || hour >= 17;
}

export function priceForHours(
  resource: { baseRate: number; peakRate: number },
  date: string,
  hours: number[]
): number {
  return hours.reduce(
    (total, hour) =>
      total + (isPeakHour(date, hour) ? resource.peakRate : resource.baseRate),
    0
  );
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
