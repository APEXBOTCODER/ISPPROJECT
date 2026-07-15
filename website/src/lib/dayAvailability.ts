export interface DaySlot {
  hour: number;
  status: "free" | "taken" | "blocked" | "past";
  peak: boolean;
  priceCents: number;
}

/** Overlapping open/close window across several facilities (null if no overlap). */
export function hourBounds(
  facilities: { openHour: number; closeHour: number }[]
): { open: number; close: number } | null {
  if (facilities.length === 0) return null;
  const open = Math.max(...facilities.map((f) => f.openHour));
  const close = Math.min(...facilities.map((f) => f.closeHour));
  return open < close ? { open, close } : null;
}

/** Client-side: fetch one day's hour availability for a facility. */
export async function fetchDayAvailability(
  resourceId: string,
  date: string
): Promise<DaySlot[]> {
  try {
    const res = await fetch(
      `/api/availability?resourceId=${encodeURIComponent(resourceId)}&date=${date}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    return (data.slots ?? []) as DaySlot[];
  } catch {
    return [];
  }
}
