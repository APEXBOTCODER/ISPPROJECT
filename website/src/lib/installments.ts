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
  paidCents: number; // money received toward reservations + advances on file
  advanceCents: number; // advances on file (unattached credit)
  balanceCents: number; // net: > 0 = balance due, < 0 = advance credit
};

/**
 * A customer's whole-account financial position as a single net number.
 *   net = (owed on all their reservations) − (advance credit on file)
 * Positive → they owe; negative → they have credit. Refunds cancel out (a
 * refunded reservation lowers both what's owed and what's paid equally).
 */
export async function userAccountSummary(userId: string): Promise<AccountSummary> {
  const [resAgg, advAgg] = await Promise.all([
    prisma.reservation.aggregate({
      where: { userId, kind: "BOOKING", status: { not: "CANCELLED" } },
      _sum: { totalCents: true, paidCents: true, refundedCents: true },
    }),
    prisma.payment.aggregate({
      where: { userId, reservationId: null },
      _sum: { amountCents: true },
    }),
  ]);
  const total = resAgg._sum.totalCents ?? 0;
  const paidToRes = resAgg._sum.paidCents ?? 0;
  const refunded = resAgg._sum.refundedCents ?? 0;
  const advance = advAgg._sum.amountCents ?? 0;

  const reservationBalance = total - paidToRes; // outstanding across reservations
  return {
    billedCents: Math.max(0, total - refunded),
    paidCents: paidToRes + advance,
    advanceCents: advance,
    balanceCents: reservationBalance - advance,
  };
}
