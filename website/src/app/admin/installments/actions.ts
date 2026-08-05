"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff, requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { config } from "@/lib/config";
import { formatCents } from "@/lib/pricing";
import {
  recordPayment,
  startPaymentPlan,
  forceCancelPlan,
  planBalanceCents,
  PAYMENT_METHODS,
} from "@/lib/installments";

const BASE = "/admin/installments";

function back(params: Record<string, string>): never {
  redirect(BASE + "?" + new URLSearchParams(params).toString());
}

/** Parse a dollars string ("125", "125.50") to integer cents, or null if invalid. */
function dollarsToCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

const methodSchema = z.enum(PAYMENT_METHODS);

/**
 * Record a deposit or installment against a payment-plan reservation. Supports
 * a "full" mode (pay the remaining balance in one click) and an "amount" mode
 * (enter the exact amount received). Staff-only.
 */
export async function recordPaymentAction(formData: FormData) {
  const staff = await requireStaff();
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) back({ error: "Missing reservation." });

  const mode = String(formData.get("mode") ?? "amount"); // amount | full
  const method = methodSchema.safeParse(String(formData.get("method") ?? "ZELLE"));
  if (!method.success) back({ error: "Choose a valid payment method." });
  const note = String(formData.get("note") ?? "").trim() || null;

  let amountCents: number;
  let kind: string;
  if (mode === "full") {
    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { totalCents: true, paidCents: true },
    });
    if (!res) back({ error: "Reservation not found." });
    amountCents = planBalanceCents(res);
    kind = "FULL";
  } else {
    const cents = dollarsToCents(String(formData.get("amount") ?? ""));
    if (cents === null || cents <= 0) back({ error: "Enter a valid dollar amount." });
    amountCents = cents;
    kind = String(formData.get("kind") ?? "") === "DEPOSIT" ? "DEPOSIT" : "INSTALLMENT";
  }

  const result = await recordPayment({
    reservationId,
    amountCents,
    method: method.data,
    kind,
    note,
    staffId: staff.id,
  });
  if (!result.ok) back({ error: result.error });

  // Best-effort receipt to the customer.
  const res = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { totalCents: true, paidCents: true, label: true, code: true, user: { select: { name: true, email: true } } },
  });
  if (res?.user.email) {
    const balance = planBalanceCents(res);
    await sendEmail({
      to: res.user.email,
      subject: `Payment received — ${config.siteName}`,
      text: [
        `Hi ${res.user.name},`,
        ``,
        `We've recorded your payment of ${formatCents(result.amountCents)}${res.label ? ` for ${res.label}` : ""}${res.code ? ` (${res.code})` : ""}.`,
        ``,
        `  Paid so far: ${formatCents(res.paidCents)}`,
        `  Balance:     ${balance === 0 ? "Paid in full — thank you!" : formatCents(balance)}`,
        ``,
        `Questions? Just reply to this email.`,
        `${config.siteName}`,
      ].join("\n"),
    });
  }

  back({ ok: `Recorded ${formatCents(result.amountCents)}.` });
}

/**
 * Put an existing reservation on a payment plan (locks the slots immediately)
 * and optionally record an initial deposit. Staff-only.
 */
export async function startPaymentPlanAction(formData: FormData) {
  const staff = await requireStaff();
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) back({ error: "Missing reservation." });

  const depositRaw = String(formData.get("deposit") ?? "").trim();
  let depositCents: number | undefined;
  if (depositRaw) {
    const cents = dollarsToCents(depositRaw);
    if (cents === null || cents < 0) back({ error: "Enter a valid deposit amount, or leave it blank." });
    depositCents = cents;
  }
  const method = methodSchema.safeParse(String(formData.get("method") ?? "ZELLE"));

  const result = await startPaymentPlan({
    reservationId,
    staffId: staff.id,
    depositCents,
    method: method.success ? method.data : "ZELLE",
  });
  if (!result.ok) back({ error: result.error });
  back({ ok: "Payment plan started — the slots are now locked." });
}

/** Look up a reservation by its short code (e.g. ISP-ABC234) and start a plan on it. */
export async function startPaymentPlanByCodeAction(formData: FormData) {
  const staff = await requireStaff();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) back({ error: "Enter a reservation code." });
  const res = await prisma.reservation.findFirst({ where: { code }, select: { id: true } });
  if (!res) back({ error: `No reservation found with code ${code}.` });

  const depositRaw = String(formData.get("deposit") ?? "").trim();
  let depositCents: number | undefined;
  if (depositRaw) {
    const cents = dollarsToCents(depositRaw);
    if (cents === null || cents < 0) back({ error: "Enter a valid deposit amount, or leave it blank." });
    depositCents = cents;
  }
  const method = methodSchema.safeParse(String(formData.get("method") ?? "ZELLE"));
  const result = await startPaymentPlan({
    reservationId: res.id,
    staffId: staff.id,
    depositCents,
    method: method.success ? method.data : "ZELLE",
  });
  if (!result.ok) back({ error: result.error });
  back({ ok: `Payment plan started for ${code} — the slots are now locked.` });
}

const cancelReasonSchema = z.string().trim().min(3, "Please enter a reason.").max(300);

/**
 * Admin override: cancel a payment-plan reservation (customers can't). Requires
 * a reason and an optional refund amount (capped at what's been collected).
 * ADMIN-only.
 */
export async function forceCancelPlanAction(formData: FormData) {
  const admin = await requireAdmin();
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) back({ error: "Missing reservation." });

  const reason = cancelReasonSchema.safeParse(String(formData.get("reason") ?? ""));
  if (!reason.success) back({ error: reason.error.issues[0]?.message ?? "Enter a reason." });

  const refundCents = dollarsToCents(String(formData.get("refund") ?? "0")) ?? 0;

  const result = await forceCancelPlan({
    reservationId,
    staffId: admin.id,
    refundCents,
    reason: reason.data,
  });
  if (!result.ok) back({ error: result.error });

  // Notify the customer their plan reservation was cancelled.
  const res = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { code: true, label: true, user: { select: { name: true, email: true } } },
  });
  if (res?.user.email) {
    await sendEmail({
      to: res.user.email,
      subject: `Reservation cancelled — ${config.siteName}`,
      text: [
        `Hi ${res.user.name},`,
        ``,
        `Your reservation${res.label ? ` for ${res.label}` : ""}${res.code ? ` (${res.code})` : ""} has been cancelled by our staff.`,
        ...(result.refundCents > 0 ? [``, `A refund of ${formatCents(result.refundCents)} has been recorded.`] : []),
        ``,
        `Questions? Just reply to this email.`,
        `${config.siteName}`,
      ].join("\n"),
    });
  }

  back({
    ok:
      result.refundCents > 0
        ? `Plan cancelled. Refund of ${formatCents(result.refundCents)} recorded.`
        : "Plan cancelled.",
  });
}
