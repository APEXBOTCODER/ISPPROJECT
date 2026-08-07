import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

// Ways a payment can be received (offline). Kept here so the admin form and the
// server actions agree on the allowed set.
export const PAYMENT_METHODS = ["ZELLE", "CASH", "CARD", "CHECK", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

function normalizeMethod(m?: string): PaymentMethod {
  const up = (m ?? "").toUpperCase();
  return (PAYMENT_METHODS as readonly string[]).includes(up) ? (up as PaymentMethod) : "ZELLE";
}

/** Outstanding balance on a reservation: what's owed minus what's been paid. */
export function planBalanceCents(res: { totalCents: number; paidCents: number }): number {
  return Math.max(0, res.totalCents - res.paidCents);
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Record a payment (deposit or installment) against a payment-plan reservation.
 * Appends a Payment ledger row and bumps the reservation's running paidCents in
 * one transaction. The amount is capped at the outstanding balance (no overpay).
 */
export async function recordPayment(opts: {
  reservationId: string;
  amountCents: number;
  method?: string;
  kind?: string;
  note?: string | null;
  staffId: string;
}): Promise<Result<{ amountCents: number }>> {
  const res = await prisma.reservation.findUnique({
    where: { id: opts.reservationId },
    select: {
      id: true,
      userId: true,
      totalCents: true,
      paidCents: true,
      paymentPlan: true,
      paymentRef: true,
      status: true,
    },
  });
  if (!res) return { ok: false, error: "Reservation not found." };
  if (res.status === "CANCELLED") return { ok: false, error: "This reservation is cancelled." };

  const balance = planBalanceCents(res);
  if (balance === 0) return { ok: false, error: "This plan is already paid in full." };

  const amount = Math.min(Math.max(0, Math.round(opts.amountCents)), balance);
  if (amount === 0) return { ok: false, error: "Enter an amount greater than $0." };

  const method = normalizeMethod(opts.method);
  const kind =
    opts.kind && ["DEPOSIT", "INSTALLMENT", "FULL"].includes(opts.kind)
      ? opts.kind
      : amount === balance
        ? "FULL"
        : "INSTALLMENT";

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        reservationId: res.id,
        userId: res.userId,
        staffId: opts.staffId,
        amountCents: amount,
        method,
        kind,
        note: opts.note?.slice(0, 300) || null,
      },
    });
    await tx.reservation.update({
      where: { id: res.id },
      data: {
        paidCents: res.paidCents + amount,
        // Give a plan reservation a payment reference the first time money moves.
        ...(res.paymentRef ? {} : { paymentRef: `PLAN-${randomUUID()}` }),
      },
    });
  });

  return { ok: true, amountCents: amount };
}

/**
 * Convert an existing reservation into a payment plan. Locks the slots
 * immediately (confirms the reservation and all its still-active bookings) and
 * optionally records an initial deposit.
 */
export async function startPaymentPlan(opts: {
  reservationId: string;
  staffId: string;
  depositCents?: number;
  method?: string;
  note?: string | null;
}): Promise<Result> {
  const res = await prisma.reservation.findUnique({
    where: { id: opts.reservationId },
    select: { id: true, status: true, paymentPlan: true, kind: true, paymentRef: true },
  });
  if (!res) return { ok: false, error: "Reservation not found." };
  if (res.kind === "BLOCK") return { ok: false, error: "Maintenance blocks can't be put on a payment plan." };
  if (res.paymentPlan) return { ok: false, error: "This reservation is already on a payment plan." };
  if (res.status === "CANCELLED") return { ok: false, error: "This reservation is cancelled." };

  const ref = res.paymentRef ?? `PLAN-${randomUUID()}`;
  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: res.id },
      data: { paymentPlan: true, status: "CONFIRMED", paymentRef: ref },
    });
    await tx.booking.updateMany({
      where: { reservationId: res.id, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
      data: { status: "CONFIRMED", paymentRef: ref },
    });
  });

  if (opts.depositCents && opts.depositCents > 0) {
    const r = await recordPayment({
      reservationId: res.id,
      amountCents: opts.depositCents,
      method: opts.method,
      kind: "DEPOSIT",
      note: opts.note ?? null,
      staffId: opts.staffId,
    });
    if (!r.ok) return { ok: false, error: `Plan created, but the deposit failed: ${r.error}` };
  }
  return { ok: true };
}

/**
 * Admin-only override to cancel a payment-plan reservation (customers can't).
 * Cancels every active booking, frees the slots, marks the reservation
 * CANCELLED, and records an optional refund (capped at what's been collected).
 */
export async function forceCancelPlan(opts: {
  reservationId: string;
  staffId: string;
  refundCents: number;
  reason: string;
}): Promise<Result<{ refundCents: number }>> {
  const res = await prisma.reservation.findUnique({
    where: { id: opts.reservationId },
    include: { bookings: true },
  });
  if (!res) return { ok: false, error: "Reservation not found." };
  if (!res.paymentPlan) return { ok: false, error: "This reservation isn't on a payment plan." };
  if (res.status === "CANCELLED") return { ok: false, error: "This reservation is already cancelled." };

  const reason = opts.reason.trim() || "Admin cancellation (payment plan)";
  // Never refund more than the net amount actually collected on the plan.
  const netCollected = Math.max(0, res.paidCents - res.refundedCents);
  const refund = Math.min(Math.max(0, Math.round(opts.refundCents)), netCollected);

  await prisma.$transaction(async (tx) => {
    for (const b of res.bookings) {
      if (b.status === "CANCELLED") continue;
      await tx.booking.update({
        where: { id: b.id },
        data: { status: "CANCELLED", notes: `Cancelled · ${reason}`.slice(0, 300) },
      });
      await tx.bookingSlot.deleteMany({ where: { bookingId: b.id } });
    }
    await tx.reservation.update({
      where: { id: res.id },
      data: { status: "CANCELLED", refundedCents: res.refundedCents + refund },
    });
    if (refund > 0) {
      await tx.refundRecord.create({
        data: {
          userId: res.userId,
          staffId: opts.staffId,
          reservationId: res.id,
          scope: "RESERVATION",
          amountCents: refund,
          cancelled: true,
          reason,
          paymentRef: res.paymentRef ?? null,
        },
      });
    }
  });

  return { ok: true, refundCents: refund };
}

/**
 * Record an account-level ADVANCE payment (a prepayment/credit not tied to any
 * one reservation). Shows up as credit that offsets the customer's balance.
 */
export async function recordAdvancePayment(opts: {
  userId: string;
  amountCents: number;
  method?: string;
  note?: string | null;
  staffId: string;
}): Promise<Result<{ amountCents: number }>> {
  const amount = Math.max(0, Math.round(opts.amountCents));
  if (amount === 0) return { ok: false, error: "Enter an amount greater than $0." };
  const user = await prisma.user.findUnique({ where: { id: opts.userId }, select: { id: true } });
  if (!user) return { ok: false, error: "Customer not found." };

  await prisma.payment.create({
    data: {
      reservationId: null,
      userId: opts.userId,
      staffId: opts.staffId,
      amountCents: amount,
      method: normalizeMethod(opts.method),
      kind: "ADVANCE",
      note: opts.note?.slice(0, 300) || null,
    },
  });
  return { ok: true, amountCents: amount };
}

/**
 * How much unapplied advance/credit a customer has on file:
 *   advance deposits (kind ADVANCE) − credit already applied to bookings (kind CREDIT).
 */
export async function advanceBalanceCents(userId: string): Promise<number> {
  const [dep, applied] = await Promise.all([
    prisma.payment.aggregate({ where: { userId, kind: "ADVANCE" }, _sum: { amountCents: true } }),
    prisma.payment.aggregate({ where: { userId, kind: "CREDIT" }, _sum: { amountCents: true } }),
  ]);
  return Math.max(0, (dep._sum.amountCents ?? 0) - (applied._sum.amountCents ?? 0));
}

/**
 * Apply a customer's advance/credit balance toward a reservation's outstanding
 * balance. Records a single CREDIT payment on the reservation (raising its
 * paidCents); because advance = deposits − credits-applied, that same row draws
 * the advance down. It's cash-neutral for revenue (the advance was collected
 * when received) and cleanly reversible by deleting the row. The amount is
 * capped at both the reservation balance and the available advance; any
 * remaining balance simply stays due.
 */
export async function applyAdvanceToReservation(opts: {
  reservationId: string;
  amountCents: number;
  staffId: string;
}): Promise<Result<{ amountCents: number }>> {
  const res = await prisma.reservation.findUnique({
    where: { id: opts.reservationId },
    select: { id: true, userId: true, totalCents: true, paidCents: true, status: true, code: true, paymentRef: true },
  });
  if (!res) return { ok: false, error: "Reservation not found." };
  if (res.status === "CANCELLED") return { ok: false, error: "This reservation is cancelled." };

  const balance = planBalanceCents(res);
  if (balance === 0) return { ok: false, error: "This reservation is already paid in full." };

  const available = await advanceBalanceCents(res.userId);
  if (available <= 0) return { ok: false, error: "This customer has no advance balance to apply." };

  const amount = Math.min(Math.max(0, Math.round(opts.amountCents)), balance, available);
  if (amount === 0) return { ok: false, error: "Enter an amount greater than $0." };

  await prisma.$transaction(async (tx) => {
    // One CREDIT row on the reservation: it raises paidCents and (via the
    // deposits−credits formula) draws the advance down. Deleting it reverses both.
    await tx.payment.create({
      data: {
        reservationId: res.id,
        userId: res.userId,
        staffId: opts.staffId,
        amountCents: amount,
        method: "CREDIT",
        kind: "CREDIT",
        note: "Applied from advance balance",
      },
    });
    await tx.reservation.update({
      where: { id: res.id },
      data: { paidCents: res.paidCents + amount, ...(res.paymentRef ? {} : { paymentRef: `PLAN-${randomUUID()}` }) },
    });
  });

  return { ok: true, amountCents: amount };
}

/**
 * Admin correction of how much has been paid on a NON-plan reservation — used to
 * fix a case that wasn't actually paid in full. Plan reservations keep their
 * paid total in sync with the ledger, so use recordPayment for those instead.
 */
export async function setReservationPaid(opts: {
  reservationId: string;
  amountCents: number;
}): Promise<Result<{ paidCents: number }>> {
  const res = await prisma.reservation.findUnique({
    where: { id: opts.reservationId },
    select: { id: true, totalCents: true, paymentPlan: true, status: true },
  });
  if (!res) return { ok: false, error: "Reservation not found." };
  if (res.paymentPlan) return { ok: false, error: "Use Record payment for plan reservations." };
  if (res.status === "CANCELLED") return { ok: false, error: "This reservation is cancelled." };

  const paid = Math.min(Math.max(0, Math.round(opts.amountCents)), res.totalCents);
  await prisma.reservation.update({ where: { id: res.id }, data: { paidCents: paid } });
  return { ok: true, paidCents: paid };
}

export type AccountSummary = {
  billedCents: number; // total booked, net of refunds (non-cancelled reservations)
  paidCents: number; // money paid toward bookings (includes applied credit)
  advanceCents: number; // advance/credit still on file (deposits − credits applied)
  balanceCents: number; // net: > 0 = balance due, < 0 = advance credit
};

/**
 * A customer's whole-account financial position as a single net number.
 *   net = (owed on all their reservations) − (advance credit on file)
 * Positive → they owe; negative → they have credit. Refunds cancel out (a
 * refunded reservation lowers both what's owed and what's paid equally).
 */
export async function userAccountSummary(userId: string): Promise<AccountSummary> {
  const [resAgg, advance] = await Promise.all([
    prisma.reservation.aggregate({
      where: { userId, kind: "BOOKING", status: { not: "CANCELLED" } },
      _sum: { totalCents: true, paidCents: true, refundedCents: true },
    }),
    advanceBalanceCents(userId),
  ]);
  const total = resAgg._sum.totalCents ?? 0;
  const paidToRes = resAgg._sum.paidCents ?? 0;
  const refunded = resAgg._sum.refundedCents ?? 0;

  const reservationBalance = total - paidToRes; // outstanding across reservations
  return {
    billedCents: Math.max(0, total - refunded),
    paidCents: paidToRes,
    advanceCents: advance,
    balanceCents: reservationBalance - advance,
  };
}

/**
 * Reverse a recorded payment (a mistake correction). ADMIN-only at the action
 * layer. A reservation-attached payment (deposit / installment / applied credit)
 * lowers that reservation's paidCents; an advance deposit is removed only if
 * doing so wouldn't drive the advance negative (i.e. credit already applied must
 * be reversed first).
 */
export async function deletePayment(paymentId: string): Promise<Result<{ amountCents: number; reservationId: string | null }>> {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p) return { ok: false, error: "Payment not found." };

  if (p.reservationId) {
    const res = await prisma.reservation.findUnique({ where: { id: p.reservationId }, select: { paidCents: true } });
    const newPaid = Math.max(0, (res?.paidCents ?? 0) - p.amountCents);
    await prisma.$transaction([
      prisma.reservation.update({ where: { id: p.reservationId }, data: { paidCents: newPaid } }),
      prisma.payment.delete({ where: { id: paymentId } }),
    ]);
  } else {
    // Advance deposit: block if removing it would make the advance negative.
    const [dep, applied] = await Promise.all([
      prisma.payment.aggregate({ where: { userId: p.userId, kind: "ADVANCE" }, _sum: { amountCents: true } }),
      prisma.payment.aggregate({ where: { userId: p.userId, kind: "CREDIT" }, _sum: { amountCents: true } }),
    ]);
    const remaining = (dep._sum.amountCents ?? 0) - p.amountCents - (applied._sum.amountCents ?? 0);
    if (remaining < 0) {
      return { ok: false, error: "Can't remove this advance — some of it is already applied to bookings. Delete the applied credit first." };
    }
    await prisma.payment.delete({ where: { id: paymentId } });
  }
  return { ok: true, amountCents: p.amountCents, reservationId: p.reservationId };
}
