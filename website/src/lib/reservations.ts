import { prisma } from "@/lib/prisma";
import { parkNow } from "@/lib/availability";
import { processRefund } from "@/lib/payments";
import { getBookingPolicy, refundPercentForPolicy } from "@/lib/policy";

/** Hours from now (park-local) until a booking starts. */
export function hoursUntilStart(date: string, startHour: number): number {
  const now = parkNow();
  const dayDiff =
    (new Date(`${date}T00:00:00`).getTime() -
      new Date(`${now.date}T00:00:00`).getTime()) /
    86_400_000;
  return dayDiff * 24 + (startHour - now.hour);
}

export type RefundOutcome =
  | { ok: true; refundCents: number }
  | { ok: false; error: string };

type RefundScope = "SEGMENT" | "RESERVATION" | "CUSTOM";

/**
 * The single primitive behind every refund. Independently controls the amount
 * (a number of cents, or "full" for the outstanding balance) and whether to
 * also cancel the booking + free its slots. Writes a RefundRecord for audit and
 * keeps the parent reservation's totals/status in sync. Does NOT email — callers
 * do, so a bulk action can send one message per customer.
 */
export async function refundBookingAdvanced(
  bookingId: string,
  opts: {
    amountCents: number | "full";
    cancel: boolean;
    reason: string;
    staffId: string;
    scope?: RefundScope;
  }
): Promise<RefundOutcome> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Booking not found." };
  if (booking.status === "BLOCKED") {
    return { ok: false, error: "Maintenance blocks aren't refundable." };
  }
  if (booking.status === "CANCELLED" && !((booking.totalCents - booking.refundedCents) > 0)) {
    return { ok: false, error: "This booking is already fully refunded." };
  }

  const outstanding = Math.max(0, booking.totalCents - booking.refundedCents);
  const requested =
    opts.amountCents === "full" ? outstanding : Math.max(0, Math.round(opts.amountCents));
  const amount = Math.min(requested, outstanding);

  if (amount === 0 && !opts.cancel) {
    return { ok: false, error: "Nothing to do — set an amount or choose to cancel." };
  }

  if (amount > 0 && booking.paymentRef) {
    const refund = await processRefund({
      paymentRef: booking.paymentRef,
      amountCents: amount,
    });
    if (!refund.ok) return { ok: false, error: refund.error };
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        refundedCents: booking.refundedCents + amount,
        ...(opts.cancel
          ? { status: "CANCELLED", notes: `Cancelled · ${opts.reason}`.slice(0, 300) }
          : {}),
      },
    });
    if (opts.cancel) {
      await tx.bookingSlot.deleteMany({ where: { bookingId } });
    }

    if (booking.reservationId) {
      const siblings = await tx.booking.findMany({
        where: { reservationId: booking.reservationId },
        select: { status: true, refundedCents: true },
      });
      const refunded = siblings.reduce((sum, b) => sum + b.refundedCents, 0);
      const allDone = siblings.every((b) => b.status === "CANCELLED");
      await tx.reservation.update({
        where: { id: booking.reservationId },
        data: { refundedCents: refunded, ...(allDone ? { status: "CANCELLED" } : {}) },
      });
    }

    await tx.refundRecord.create({
      data: {
        userId: booking.userId,
        staffId: opts.staffId,
        reservationId: booking.reservationId ?? null,
        bookingId: booking.id,
        scope: opts.scope ?? "SEGMENT",
        amountCents: amount,
        cancelled: opts.cancel,
        reason: opts.reason,
        paymentRef: booking.paymentRef ?? null,
      },
    });
  });

  return { ok: true, refundCents: amount };
}

export type BulkRefundResult = {
  ok: boolean;
  refundCents: number;
  count: number;
  errors: string[];
};

/**
 * Refund a mix of whole reservations and individual segments in full. Expands
 * each reservation to its still-active segments, dedupes, and applies
 * refundBookingAdvanced to each.
 */
export async function refundManyAdvanced(
  targets: { bookingIds?: string[]; reservationIds?: string[] },
  opts: { cancel: boolean; reason: string; staffId: string }
): Promise<BulkRefundResult> {
  const scopeById = new Map<string, RefundScope>();
  for (const id of targets.bookingIds ?? []) scopeById.set(id, "SEGMENT");

  const reservationIds = targets.reservationIds ?? [];
  if (reservationIds.length) {
    const resBookings = await prisma.booking.findMany({
      where: {
        reservationId: { in: reservationIds },
        status: { in: ["CONFIRMED", "PENDING"] },
      },
      select: { id: true },
    });
    for (const b of resBookings) {
      if (!scopeById.has(b.id)) scopeById.set(b.id, "RESERVATION");
    }
  }

  let refundCents = 0;
  let count = 0;
  const errors: string[] = [];
  for (const [id, scope] of scopeById) {
    const r = await refundBookingAdvanced(id, {
      amountCents: "full",
      cancel: opts.cancel,
      reason: opts.reason,
      staffId: opts.staffId,
      scope,
    });
    if (r.ok) {
      refundCents += r.refundCents;
      count += 1;
    } else {
      errors.push(r.error);
    }
  }
  return { ok: errors.length === 0, refundCents, count, errors };
}

/** Customer self-cancel of a whole reservation, applying the policy % per segment. */
export async function refundReservationPolicy(
  reservationId: string,
  staffId: string
): Promise<BulkRefundResult> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { bookings: true },
  });
  if (!reservation) {
    return { ok: false, refundCents: 0, count: 0, errors: ["Reservation not found."] };
  }

  const policy = await getBookingPolicy();
  let refundCents = 0;
  let count = 0;
  const errors: string[] = [];
  for (const b of reservation.bookings) {
    if (b.status !== "CONFIRMED") continue;
    const outstanding = Math.max(0, b.totalCents - b.refundedCents);
    const hoursAhead = hoursUntilStart(b.date, b.startHour);
    const percent = hoursAhead <= 0 ? 0 : refundPercentForPolicy(hoursAhead, policy);
    const amount = Math.round((outstanding * percent) / 100);
    const r = await refundBookingAdvanced(b.id, {
      amountCents: amount,
      cancel: true,
      reason: "Customer cancellation",
      staffId,
      scope: "RESERVATION",
    });
    if (r.ok) {
      refundCents += r.refundCents;
      count += 1;
    } else {
      errors.push(r.error);
    }
  }
  return { ok: errors.length === 0, refundCents, count, errors };
}

/** Total a user could still be refunded: everything they've paid minus everything refunded. */
export async function userRefundCapCents(userId: string): Promise<number> {
  const [paid, refunded] = await Promise.all([
    prisma.booking.aggregate({
      where: { userId, paymentRef: { not: null }, status: { not: "BLOCKED" } },
      _sum: { totalCents: true },
    }),
    prisma.refundRecord.aggregate({
      where: { userId },
      _sum: { amountCents: true },
    }),
  ]);
  return Math.max(0, (paid._sum.totalCents ?? 0) - (refunded._sum.amountCents ?? 0));
}

/**
 * Money-only goodwill/partial refund for a user, not tied to cancelling any
 * booking. Capped at the user's refundable balance and recorded in the audit log.
 */
export async function customRefundForUser(opts: {
  userId: string;
  amountCents: number;
  reason: string;
  staffId: string;
}): Promise<RefundOutcome> {
  const amount = Math.max(0, Math.round(opts.amountCents));
  if (amount === 0) return { ok: false, error: "Enter an amount greater than $0." };

  const cap = await userRefundCapCents(opts.userId);
  if (amount > cap) {
    return {
      ok: false,
      error: `Amount exceeds this user's refundable balance ($${(cap / 100).toFixed(2)}).`,
    };
  }

  // Refund against the user's most recent payment (needed by real providers).
  const lastPaid = await prisma.booking.findFirst({
    where: { userId: opts.userId, paymentRef: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { paymentRef: true, reservationId: true },
  });
  if (lastPaid?.paymentRef) {
    const refund = await processRefund({
      paymentRef: lastPaid.paymentRef,
      amountCents: amount,
    });
    if (!refund.ok) return { ok: false, error: refund.error };
  }

  await prisma.refundRecord.create({
    data: {
      userId: opts.userId,
      staffId: opts.staffId,
      reservationId: lastPaid?.reservationId ?? null,
      scope: "CUSTOM",
      amountCents: amount,
      cancelled: false,
      reason: opts.reason,
      paymentRef: lastPaid?.paymentRef ?? null,
    },
  });

  return { ok: true, refundCents: amount };
}
