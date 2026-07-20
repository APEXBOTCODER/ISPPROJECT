import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";

export type SlotStatus = "free" | "taken" | "blocked" | "past";

export interface SlotInfo {
  hour: number;
  status: SlotStatus;
  peak: boolean;
  priceCents: number;
}

export function slotKey(date: string, hour: number): string {
  return `${date}:${String(hour).padStart(2, "0")}`;
}

/** Current date/time in the park's timezone (America/Chicago). */
export function parkNow(): { date: string; hour: number } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
  };
}

/** Release expired unpaid holds so their slots return to the pool. */
export async function releaseExpiredHolds(): Promise<void> {
  const { getBookingPolicy } = await import("@/lib/policy");
  const { holdMinutes } = await getBookingPolicy();
  const cutoff = new Date(Date.now() - holdMinutes * 60_000);
  await prisma.booking.updateMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    data: { status: "CANCELLED", notes: "Hold expired before payment" },
  });
  await prisma.bookingSlot.deleteMany({
    where: { booking: { status: "CANCELLED" } },
  });
}

/**
 * Auto-expire unpaid (Zelle-pending) reservations older than the policy window,
 * freeing their slots. Race-safe: only the caller that flips a reservation to
 * CANCELLED emails the customer, so concurrent sweeps don't double-notify.
 */
export async function releaseExpiredUnpaid(): Promise<void> {
  const { getBookingPolicy } = await import("@/lib/policy");
  const { unpaidExpiryHours } = await getBookingPolicy();
  if (!unpaidExpiryHours || unpaidExpiryHours <= 0) return;

  const cutoff = new Date(Date.now() - unpaidExpiryHours * 3_600_000);
  const expired = await prisma.reservation.findMany({
    where: { kind: "BOOKING", status: "PENDING_PAYMENT", createdAt: { lt: cutoff } },
    include: {
      user: { select: { name: true, email: true } },
      bookings: {
        include: { resource: { select: { name: true } } },
        orderBy: [{ date: "asc" }, { startHour: "asc" }],
      },
    },
    take: 100,
  });
  if (expired.length === 0) return;

  const { sendEmail } = await import("@/lib/email");
  const { formatCents } = await import("@/lib/pricing");

  for (const r of expired) {
    // Claim atomically so parallel sweeps don't double-cancel / double-email.
    const claim = await prisma.reservation.updateMany({
      where: { id: r.id, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED", notes: `Auto-expired — payment not received within ${unpaidExpiryHours}h` },
    });
    if (claim.count === 0) continue;

    await prisma.booking.updateMany({
      where: { reservationId: r.id },
      data: { status: "CANCELLED", notes: "Auto-expired — unpaid" },
    });
    await prisma.bookingSlot.deleteMany({ where: { booking: { reservationId: r.id } } });

    await sendEmail({
      to: r.user.email,
      subject: `Reservation ${r.code ?? ""} expired — payment not received`,
      text: [
        `Hi ${r.user.name},`,
        ``,
        `Your held reservation ${r.code ?? ""} has expired — we didn't receive payment within ${unpaidExpiryHours} hours, so the slots have been released.`,
        ...(r.label ? [`Organization: ${r.label}`] : []),
        ``,
        ...r.bookings.map((b) => `  • ${b.resource.name} — ${b.date}, ${b.startHour}:00–${b.endHour}:00 — ${formatCents(b.totalCents)}`),
        ``,
        `Still want these times? Book again: ${config.siteUrl}/book`,
        ``,
        `Infinity Sports Park — ${config.tagline}`,
      ].join("\n"),
    });
  }
}

/**
 * After a booking transaction fails on the unique-slot constraint, figure out
 * which of the requested segments are now occupied (by someone else) and return
 * them as friendly "Facility · date" labels for the error message.
 */
export async function findSlotConflicts(
  segments: { resourceId: string; resourceName: string; date: string; hours: number[] }[]
): Promise<string[]> {
  const wanted = segments.flatMap((s) =>
    s.hours.map((h) => ({ resourceId: s.resourceId, slotKey: slotKey(s.date, h) }))
  );
  if (wanted.length === 0) return [];

  const taken = await prisma.bookingSlot.findMany({
    where: {
      OR: wanted.map((w) => ({ resourceId: w.resourceId, slotKey: w.slotKey })),
      booking: { status: { in: ["PENDING", "PENDING_PAYMENT", "CONFIRMED", "BLOCKED"] } },
    },
    select: { resourceId: true, slotKey: true },
  });

  const nameByKey = new Map(segments.map((s) => [`${s.resourceId}:${s.date}`, s.resourceName]));
  const conflicts = new Set<string>();
  for (const t of taken) {
    const date = t.slotKey.split(":")[0];
    const name = nameByKey.get(`${t.resourceId}:${date}`) ?? "A facility";
    conflicts.add(`${name} · ${date}`);
  }
  return [...conflicts].sort();
}

/** Hour-by-hour availability for one resource on one park-local date. */
export async function getAvailability(
  resourceId: string,
  date: string
): Promise<SlotInfo[]> {
  await releaseExpiredHolds();
  await releaseExpiredUnpaid();

  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource) return [];

  const occupied = await prisma.bookingSlot.findMany({
    where: {
      resourceId,
      slotKey: { startsWith: `${date}:` },
      booking: { status: { in: ["PENDING", "PENDING_PAYMENT", "CONFIRMED", "BLOCKED"] } },
    },
    include: { booking: { select: { status: true } } },
  });
  const occupiedMap = new Map(
    occupied.map((slot) => [slot.slotKey, slot.booking.status])
  );

  const now = parkNow();
  const { isPeakHour } = await import("@/lib/pricing");

  const slots: SlotInfo[] = [];
  for (let hour = resource.openHour; hour < resource.closeHour; hour++) {
    const key = slotKey(date, hour);
    let status: SlotStatus = "free";
    if (date < now.date || (date === now.date && hour <= now.hour)) {
      status = "past";
    } else if (occupiedMap.has(key)) {
      status = occupiedMap.get(key) === "BLOCKED" ? "blocked" : "taken";
    }
    const peak = isPeakHour(date, hour);
    slots.push({
      hour,
      status,
      peak,
      priceCents: peak ? resource.peakRate : resource.baseRate,
    });
  }
  return slots;
}
