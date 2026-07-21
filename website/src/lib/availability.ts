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

export type CancelledUnpaid = {
  id: string;
  code: string | null;
  label: string | null;
  totalCents: number;
  user: { name: string; email: string };
  bookings: { date: string; startHour: number; endHour: number; totalCents: number; resource: { name: string } }[];
};

/**
 * Cancel a single unpaid (PENDING_PAYMENT) reservation and free its slots.
 * Race-safe: the conditional updateMany means only ONE caller (a sweep, the
 * customer, or an admin) actually flips it, so nobody double-cancels or
 * double-emails. Returns the reservation details for the caller to email, or
 * ok:false if it was already handled / isn't pending.
 */
export async function cancelUnpaidReservation(
  reservationId: string,
  note: string
): Promise<{ ok: false } | { ok: true; reservation: CancelledUnpaid }> {
  const claim = await prisma.reservation.updateMany({
    where: { id: reservationId, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED", notes: note },
  });
  if (claim.count === 0) return { ok: false };

  await prisma.booking.updateMany({
    where: { reservationId },
    data: { status: "CANCELLED", notes: note },
  });
  await prisma.bookingSlot.deleteMany({ where: { booking: { reservationId } } });

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      code: true,
      label: true,
      totalCents: true,
      user: { select: { name: true, email: true } },
      bookings: {
        select: { date: true, startHour: true, endHour: true, totalCents: true, resource: { select: { name: true } } },
        orderBy: [{ date: "asc" }, { startHour: "asc" }],
      },
    },
  });
  return { ok: true, reservation: reservation as CancelledUnpaid };
}

/**
 * Auto-expire unpaid (Zelle-pending) reservations older than the policy window,
 * freeing their slots and emailing the customer.
 */
export async function releaseExpiredUnpaid(): Promise<void> {
  const { getBookingPolicy } = await import("@/lib/policy");
  const { unpaidExpiryHours } = await getBookingPolicy();
  if (!unpaidExpiryHours || unpaidExpiryHours <= 0) return;

  const cutoff = new Date(Date.now() - unpaidExpiryHours * 3_600_000);
  const expired = await prisma.reservation.findMany({
    where: { kind: "BOOKING", status: "PENDING_PAYMENT", createdAt: { lt: cutoff } },
    select: { id: true },
    take: 100,
  });
  if (expired.length === 0) return;

  const { sendEmail } = await import("@/lib/email");
  const { formatCents } = await import("@/lib/pricing");
  const hoursLabel = unpaidExpiryHours === 1 ? "1 hour" : `${unpaidExpiryHours} hours`;

  for (const { id } of expired) {
    const result = await cancelUnpaidReservation(id, `Auto-expired — payment not received within ${unpaidExpiryHours}h`);
    if (!result.ok) continue;
    const r = result.reservation;

    await sendEmail({
      to: r.user.email,
      subject: `Reservation ${r.code ?? ""} expired — payment not received`,
      text: [
        `Hi ${r.user.name},`,
        ``,
        `Your held reservation ${r.code ?? ""} has expired — we didn't receive payment within ${hoursLabel}, so the slots have been released.`,
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
