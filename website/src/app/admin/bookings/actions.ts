"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { priceForHours, formatCents } from "@/lib/pricing";
import { parkNow, slotKey, findSlotConflicts, cancelUnpaidReservation } from "@/lib/availability";
import { getBookingPolicy } from "@/lib/policy";
import { refundBookingAdvanced } from "@/lib/reservations";
import { sendEmail } from "@/lib/email";
import { config } from "@/lib/config";
import { makeReservationCode } from "@/lib/reservationCode";

/** A reservation code not currently in use (retries on the rare collision). */
async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = makeReservationCode();
    const clash = await prisma.reservation.findFirst({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  return `ISP-${randomUUID().slice(0, 6).toUpperCase()}`;
}

const segmentSchema = z.object({
  resourceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.array(z.number().int().min(0).max(23)).min(1).max(24),
});

function isContiguous(hours: number[]): boolean {
  const s = [...hours].sort((a, b) => a - b);
  return s.every((h, i) => i === 0 || h === s[i - 1] + 1);
}

function fail(returnTo: string, message: string): never {
  redirect(returnTo + (returnTo.includes("?") ? "&" : "?") + "error=" + encodeURIComponent(message));
}

/**
 * Staff-created reservation for a walk-in / phone customer. Skips the verify +
 * waiver gates (staff override) and records a comp payment ref. Otherwise
 * identical to the customer reservation flow: atomic hold with the double-book
 * guard, one reservation grouping the day-segments.
 */
export async function createAdminReservation(formData: FormData) {
  const staff = await requireStaff();
  const returnTo = "/admin/bookings/new";

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) fail(returnTo, "Select a customer.");
  const customer = await prisma.user.findUnique({ where: { id: customerId } });
  if (!customer) fail(returnTo, "Customer not found.");

  let rawSegments: unknown = [];
  try {
    rawSegments = JSON.parse(String(formData.get("segments") ?? "[]"));
  } catch {
    fail(returnTo, "Invalid selection.");
  }
  const parsed = z.array(segmentSchema).min(1).max(90).safeParse(rawSegments);
  if (!parsed.success) fail(returnTo, "Add at least one day.");
  const segments = parsed.data;

  // Optional special rate per hour (admin override). Blank → standard pricing.
  const rateRaw = String(formData.get("rate") ?? "").trim();
  const rateCents = rateRaw ? Math.round(parseFloat(rateRaw) * 100) : null;
  if (rateRaw && (rateCents === null || Number.isNaN(rateCents) || rateCents < 0)) {
    fail(returnTo, "Enter a valid rate per hour, or leave it blank for standard pricing.");
  }

  // Backdate mode: record a past booking that was missed online (e.g. a walk-in
  // who paid or still owes). Past dates are allowed and the "future window"
  // checks are relaxed to a 2-year lower bound.
  const backdate = String(formData.get("backdate") ?? "") === "on";

  const policy = await getBookingPolicy();
  const now = parkNow();
  const maxDate = new Date(`${now.date}T00:00:00`);
  maxDate.setDate(maxDate.getDate() + policy.advanceBookingDays);
  const maxDateStr = maxDate.toISOString().slice(0, 10);
  const minDate = new Date(`${now.date}T00:00:00`);
  minDate.setDate(minDate.getDate() - 731);
  const minDateStr = minDate.toISOString().slice(0, 10);

  const resourceIds = Array.from(new Set(segments.map((s) => s.resourceId)));
  const resources = await prisma.resource.findMany({ where: { id: { in: resourceIds } } });
  const byId = new Map(resources.map((r) => [r.id, r]));

  const prepared = [] as {
    resourceId: string;
    resourceName: string;
    date: string;
    hours: number[];
    startHour: number;
    endHour: number;
    totalCents: number;
  }[];
  const seen = new Set<string>();
  for (const seg of segments) {
    const resource = byId.get(seg.resourceId);
    if (!resource || !resource.active) fail(returnTo, "A selected facility is unavailable.");
    const hours = [...seg.hours].sort((a, b) => a - b);
    if (!isContiguous(hours)) fail(returnTo, "Each day must be consecutive hours.");
    // No per-segment hour cap for admin bookings (staff can book any length).
    const badHours = hours[0] < resource.openHour || hours[hours.length - 1] >= resource.closeHour;
    if (backdate) {
      if (seg.date > now.date || seg.date < minDateStr || badHours) {
        fail(returnTo, `A time on ${seg.date} is outside the allowed range (past bookings only, up to 2 years back).`);
      }
    } else if (
      seg.date < now.date ||
      seg.date > maxDateStr ||
      (seg.date === now.date && hours[0] <= now.hour) ||
      badHours
    ) {
      fail(returnTo, `A time on ${seg.date} is outside the bookable window.`);
    }
    for (const h of hours) {
      const key = `${seg.resourceId}:${slotKey(seg.date, h)}`;
      if (seen.has(key)) fail(returnTo, "Duplicate slot in the selection.");
      seen.add(key);
    }
    prepared.push({
      resourceId: resource.id,
      resourceName: resource.name,
      date: seg.date,
      hours,
      startHour: hours[0],
      endHour: hours[hours.length - 1] + 1,
      totalCents: rateCents != null ? rateCents * hours.length : priceForHours(resource, seg.date, hours),
    });
  }

  const grandTotal = prepared.reduce((s, p) => s + p.totalCents, 0);

  // Payment plan: not a comp — the customer owes the total and pays in
  // installments. An optional deposit is recorded now. Slots still lock (the
  // admin flow always confirms), but revenue counts only what's actually paid.
  // A backdated booking is either paid in full or still owed ("due"). A "due"
  // one is recorded as an owed (plan-style) reservation so it shows as a balance
  // and is excluded from collected revenue until it's actually paid.
  const pastDue = backdate && String(formData.get("pastPaid") ?? "paid") === "due";
  const isPlan = backdate ? pastDue : String(formData.get("paymentPlan") ?? "") === "on";
  const methodRaw = String(formData.get("method") ?? "ZELLE").toUpperCase();
  const method = ["ZELLE", "CASH", "CARD", "CHECK", "OTHER"].includes(methodRaw) ? methodRaw : "ZELLE";
  let depositCents = 0;
  if (isPlan && !backdate) {
    const dRaw = String(formData.get("deposit") ?? "").trim();
    if (dRaw) {
      const c = Math.round(parseFloat(dRaw) * 100);
      if (!Number.isNaN(c) && c > 0) depositCents = Math.min(c, grandTotal);
    }
  }
  // How much is paid at creation: backdated → full if paid, 0 if due; otherwise
  // a plan pays its deposit and a normal comp is paid in full.
  const paidValue = backdate ? (pastDue ? 0 : grandTotal) : isPlan ? depositCents : grandTotal;
  const ref = backdate
    ? pastDue
      ? null
      : `ADMIN-PAST-${randomUUID()}`
    : isPlan
      ? `PLAN-${randomUUID()}`
      : `ADMIN-${randomUUID()}`;
  const code = await uniqueCode();

  let reservationId: string;
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.create({
        data: {
          userId: customerId,
          code,
          kind: "BOOKING",
          label: String(formData.get("label") ?? "").slice(0, 120) || `Staff booking by ${staff.name}`,
          totalCents: grandTotal,
          status: "CONFIRMED",
          paymentRef: ref,
          paymentPlan: isPlan,
          paidCents: paidValue,
          notes: backdate
            ? `Past booking recorded by staff (${staff.email})`
            : `Created by staff (${staff.email})`,
        },
      });
      for (const seg of prepared) {
        const booking = await tx.booking.create({
          data: {
            userId: customerId,
            reservationId: res.id,
            resourceId: seg.resourceId,
            date: seg.date,
            startHour: seg.startHour,
            endHour: seg.endHour,
            status: "CONFIRMED",
            totalCents: seg.totalCents,
            paymentRef: ref,
          },
        });
        await tx.bookingSlot.createMany({
          data: seg.hours.map((h) => ({
            bookingId: booking.id,
            resourceId: seg.resourceId,
            slotKey: slotKey(seg.date, h),
          })),
        });
      }
      if (isPlan && depositCents > 0) {
        await tx.payment.create({
          data: {
            reservationId: res.id,
            userId: customerId,
            staffId: staff.id,
            amountCents: depositCents,
            method,
            kind: "DEPOSIT",
            note: "Deposit at booking",
          },
        });
      }
      return res;
    });
    reservationId = reservation.id;
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") {
      const conflicts = await findSlotConflicts(prepared);
      fail(
        returnTo,
        conflicts.length
          ? `No longer available — just booked: ${conflicts.join("; ")}. Adjust and try again.`
          : "One of those slots is already taken."
      );
    }
    throw error;
  }

  // Don't email a "booking confirmed" for a backdated (already-past) record.
  if (!backdate) {
    await sendEmail({
      to: customer.email,
      subject: `Booking confirmed — Infinity Sports Park`,
      text: [
        `Hi ${customer.name},`,
        ``,
        `Our staff booked the following for you:`,
        ...prepared.map((s) => `  • ${s.resourceName} — ${s.date}, ${s.startHour}:00–${s.endHour}:00`),
        ``,
        `Total: ${formatCents(grandTotal)}`,
        ...(isPlan
          ? [
              `Deposit received: ${formatCents(depositCents)}`,
              `Balance to pay: ${formatCents(grandTotal - depositCents)}`,
              ``,
              `This is a payment plan — you can settle the balance in installments. We'll email a receipt each time a payment is recorded.`,
            ]
          : []),
        ``,
        `Manage it any time: ${config.siteUrl}/dashboard`,
      ].join("\n"),
    });
  }

  const okMsg = backdate
    ? pastDue
      ? `Recorded past booking for ${customer.name} — ${formatCents(grandTotal)} due. Track it on their account / under Installments.`
      : `Recorded past booking for ${customer.name} — ${formatCents(grandTotal)} paid.`
    : isPlan
      ? `Payment plan created for ${customer.name} — ${formatCents(grandTotal - depositCents)} balance. Manage it under Installments.`
      : `Booked ${prepared.length} session(s) for ${customer.name}.`;
  redirect(`/admin/bookings?ok=${encodeURIComponent(okMsg)}`);
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Move/adjust one booking: new ground and/or date, and new start AND end hours
 * (so hours can be reduced or extended). A same-length move keeps the price; a
 * duration change reprices — a reduction refunds the difference, an extension
 * raises the amount owed. Atomic slot swap; only into free slots.
 */
export async function rescheduleBooking(formData: FormData) {
  const staff = await requireStaff();
  const id = String(formData.get("bookingId") ?? "");
  const returnTo = `/admin/bookings/${id}/reschedule`;
  const newDate = String(formData.get("date") ?? "");
  const newStart = Number(formData.get("startHour"));
  const newEnd = Number(formData.get("endHour"));

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(newDate) ||
    !Number.isInteger(newStart) ||
    !Number.isInteger(newEnd) ||
    newEnd <= newStart
  ) {
    fail(returnTo, "Pick a valid date and start/end hours (end after start).");
  }

  const booking = await prisma.booking.findUnique({ where: { id }, include: { resource: true, user: true } });
  if (!booking || booking.status !== "CONFIRMED") fail(returnTo, "Only confirmed bookings can be rescheduled.");

  // Optional ground change: default to the booking's current ground.
  const newResourceId = String(formData.get("resourceId") ?? "") || booking.resourceId;
  const target =
    newResourceId === booking.resourceId
      ? booking.resource
      : await prisma.resource.findUnique({ where: { id: newResourceId } });
  if (!target || !target.active) fail(returnTo, "The chosen ground isn't available.");

  const now = parkNow();
  const policy = await getBookingPolicy();
  const maxDateStr = addDays(now.date, policy.advanceBookingDays);
  if (
    newDate < now.date ||
    newDate > maxDateStr ||
    (newDate === now.date && newStart <= now.hour) ||
    newStart < target.openHour ||
    newEnd > target.closeHour
  ) {
    fail(returnTo, `New time is outside ${target.name}'s booking window.`);
  }

  const hours = Array.from({ length: newEnd - newStart }, (_, i) => newStart + i);
  const oldDuration = booking.endHour - booking.startHour;
  const newDuration = newEnd - newStart;

  // Keep the SAME per-hour rate the booking already has (its outstanding value ÷
  // current hours), so a reschedule/reduction is priced at the customer's
  // original rate — not the ground's standard/peak rate. A same-length move
  // therefore leaves the price unchanged.
  const outstanding = Math.max(0, booking.totalCents - booking.refundedCents);
  const perHourCents = oldDuration > 0 ? outstanding / oldDuration : 0;
  const newPrice = Math.round(perHourCents * newDuration);
  const refundAmount = Math.max(0, outstanding - newPrice);
  const additional = Math.max(0, newPrice - outstanding);

  // 1. Atomic slot swap + ground/date/hour update — only into free slots.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.bookingSlot.deleteMany({ where: { bookingId: id } });
      await tx.booking.update({
        where: { id },
        data: { resourceId: target.id, date: newDate, startHour: newStart, endHour: newEnd },
      });
      await tx.bookingSlot.createMany({
        data: hours.map((h) => ({ bookingId: id, resourceId: target.id, slotKey: slotKey(newDate, h) })),
      });
    });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") {
      fail(returnTo, `That slot on ${target.name} is already taken — nothing changed.`);
    }
    throw error;
  }

  // 2. Money. Keep totalCents as the gross originally charged: a reduction adds
  //    a refund record (net revenue stays correct); an extension raises the
  //    gross (the extra is owed and collected offline).
  if (refundAmount > 0) {
    await refundBookingAdvanced(id, {
      amountCents: refundAmount,
      cancel: false,
      reason: "Hours reduced on reschedule",
      staffId: staff.id,
    });
  } else if (additional > 0) {
    await prisma.$transaction([
      prisma.booking.update({ where: { id }, data: { totalCents: booking.totalCents + additional } }),
      ...(booking.reservationId
        ? [prisma.reservation.update({ where: { id: booking.reservationId }, data: { totalCents: { increment: additional } } })]
        : []),
    ]);
  }

  // 3. Notify the customer.
  await sendEmail({
    to: booking.user.email,
    subject: `Booking rescheduled — ${target.name}`,
    text: [
      `Hi ${booking.user.name},`,
      ``,
      `Your booking has been updated by our staff to:`,
      `  ${target.name} — ${newDate}, ${newStart}:00–${newEnd}:00 (US Central) (${newDuration}h)`,
      ...(refundAmount > 0 ? [``, `A refund of ${formatCents(refundAmount)} has been issued for the reduced time.`] : []),
      ...(additional > 0 ? [``, `Additional amount due: ${formatCents(additional)} — we'll be in touch to collect it via Zelle.`] : []),
      ``,
      `Manage your bookings: ${config.siteUrl}/dashboard`,
    ].join("\n"),
  });

  const okMsg =
    refundAmount > 0
      ? `Rescheduled · refunded ${formatCents(refundAmount)}.`
      : additional > 0
      ? `Rescheduled · ${formatCents(additional)} additional due.`
      : "Booking rescheduled.";
  redirect(`/admin/bookings?ok=${encodeURIComponent(okMsg)}`);
}

/**
 * Reschedule several confirmed bookings at once: optionally move them all to a
 * different ground, and/or shift every session by a number of days. Each
 * session keeps its start/end hours, duration, and price. All-or-nothing — if
 * any target slot is taken or out of window, nothing moves.
 */
export async function bulkReschedule(formData: FormData) {
  await requireStaff();
  const returnTo = String(formData.get("returnTo") || "/admin/bookings");

  let ids: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("bookingIds") ?? "[]"));
    if (Array.isArray(parsed)) ids = parsed.filter((x) => typeof x === "string");
  } catch {
    /* empty */
  }
  if (ids.length === 0) fail(returnTo, "No bookings selected.");

  const targetResourceId = String(formData.get("targetResourceId") ?? "").trim();
  const dayShift = parseInt(String(formData.get("dayShift") ?? "0"), 10) || 0;
  if (!targetResourceId && dayShift === 0) {
    fail(returnTo, "Choose a different ground or a day shift (or both).");
  }

  const bookings = await prisma.booking.findMany({
    where: { id: { in: ids }, status: "CONFIRMED" },
    include: { resource: true, user: true },
  });
  if (bookings.length === 0) fail(returnTo, "None of the selected bookings can be rescheduled (must be confirmed).");

  const target = targetResourceId ? await prisma.resource.findUnique({ where: { id: targetResourceId } }) : null;
  if (targetResourceId && (!target || !target.active)) fail(returnTo, "The chosen ground isn't available.");

  const now = parkNow();
  const policy = await getBookingPolicy();
  const maxDateStr = addDays(now.date, policy.advanceBookingDays);

  const moves = bookings.map((b) => {
    const res = target ?? b.resource;
    const date = addDays(b.date, dayShift);
    const hours = Array.from({ length: b.endHour - b.startHour }, (_, i) => b.startHour + i);
    return { b, res, date, hours };
  });

  for (const m of moves) {
    if (
      m.date < now.date ||
      m.date > maxDateStr ||
      (m.date === now.date && m.b.startHour <= now.hour) ||
      m.b.startHour < m.res.openHour ||
      m.b.endHour > m.res.closeHour
    ) {
      fail(returnTo, `${m.res.name} on ${m.date} at ${m.b.startHour}:00 is outside the booking window — nothing moved.`);
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Free every selected booking's current slots first so a same-place move
      // (dayShift 0, same ground) doesn't collide with itself.
      for (const m of moves) await tx.bookingSlot.deleteMany({ where: { bookingId: m.b.id } });
      for (const m of moves) {
        await tx.booking.update({ where: { id: m.b.id }, data: { resourceId: m.res.id, date: m.date } });
        await tx.bookingSlot.createMany({
          data: m.hours.map((h) => ({ bookingId: m.b.id, resourceId: m.res.id, slotKey: slotKey(m.date, h) })),
        });
      }
    });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") {
      fail(returnTo, "One or more target slots are already taken — nothing was moved. Adjust and try again.");
    }
    throw error;
  }

  // Notify each affected user once, listing their moved sessions.
  const byUser = new Map<string, typeof moves>();
  for (const m of moves) {
    const arr = byUser.get(m.b.userId) ?? [];
    arr.push(m);
    byUser.set(m.b.userId, arr);
  }
  for (const [, list] of byUser) {
    await sendEmail({
      to: list[0].b.user.email,
      subject: `Booking${list.length > 1 ? "s" : ""} rescheduled — ${config.siteName}`,
      text: [
        `Hi ${list[0].b.user.name},`,
        ``,
        `Our staff rescheduled the following session${list.length > 1 ? "s" : ""}:`,
        ...list.map((m) => `  • ${m.res.name} — ${m.date}, ${m.b.startHour}:00–${m.b.endHour}:00 (US Central)`),
        ``,
        `Manage your bookings: ${config.siteUrl}/dashboard`,
      ].join("\n"),
    });
  }

  redirect(`/admin/bookings?ok=${encodeURIComponent(`Rescheduled ${moves.length} session(s).`)}`);
}

type Confirmable = {
  id: string;
  code: string | null;
  label: string | null;
  totalCents: number;
  user: { name: string; email: string };
  bookings: { date: string; startHour: number; endHour: number; totalCents: number; resource: { name: string } }[];
};

async function emailReservationConfirmed(r: Confirmable) {
  await sendEmail({
    to: r.user.email,
    subject: `Payment received — reservation ${r.code ?? ""} confirmed`,
    text: [
      `Hi ${r.user.name},`,
      ``,
      `Good news — we've received your payment and your reservation is CONFIRMED.`,
      `Reservation ID: ${r.code ?? r.id}`,
      ...(r.label ? [`Organization: ${r.label}`] : []),
      ``,
      ...r.bookings.map(
        (b) => `  • ${b.resource.name} — ${b.date}, ${b.startHour}:00–${b.endHour}:00 (US Central) — ${formatCents(b.totalCents)}`
      ),
      ``,
      `  Total: ${formatCents(r.totalCents)}`,
      ``,
      `See you on the field!`,
      `Infinity Sports Park — ${config.tagline}`,
    ].join("\n"),
  });
}

async function confirmOne(r: Confirmable) {
  const ref = `ZELLE-${r.code ?? r.id}`;
  await prisma.$transaction([
    // Zelle payment is verified in full before confirming, so the reservation is
    // paid in full — record that so the account balance is accurate.
    prisma.reservation.update({ where: { id: r.id }, data: { status: "CONFIRMED", paymentRef: ref, paidCents: r.totalCents } }),
    prisma.booking.updateMany({ where: { reservationId: r.id }, data: { status: "CONFIRMED", paymentRef: ref } }),
  ]);
  await emailReservationConfirmed(r);
}

const confirmInclude = { user: true, bookings: { include: { resource: true } } } as const;

/** Confirm a single reservation's payment (staff verified Zelle receipt). */
export async function confirmReservationPayment(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("reservationId") ?? "");
  const returnTo = "/admin/bookings";
  const r = await prisma.reservation.findUnique({ where: { id }, include: confirmInclude });
  if (!r) fail(returnTo, "Reservation not found.");
  if (r.status !== "PENDING_PAYMENT") {
    redirect(returnTo + "?ok=" + encodeURIComponent("That reservation is already handled."));
  }
  await confirmOne(r);
  redirect(returnTo + "?ok=" + encodeURIComponent(`Confirmed ${r.code ?? ""} for ${r.user.name}.`));
}

/** Reject/cancel a pending-payment reservation when no Zelle was received.
 *  Frees the slots and emails the customer. */
export async function rejectReservationPayment(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("reservationId") ?? "");
  const returnTo = "/admin/bookings";
  const existing = await prisma.reservation.findUnique({ where: { id }, select: { status: true } });
  if (!existing) fail(returnTo, "Reservation not found.");
  if (existing.status !== "PENDING_PAYMENT") {
    redirect(returnTo + "?ok=" + encodeURIComponent("That reservation is already handled."));
  }
  const result = await cancelUnpaidReservation(id, "Cancelled by staff — payment not received");
  if (!result.ok) {
    redirect(returnTo + "?ok=" + encodeURIComponent("That reservation is already handled."));
  }
  const r = result.reservation;
  await sendEmail({
    to: r.user.email,
    subject: `Reservation ${r.code ?? ""} cancelled — payment not received`,
    text: [
      `Hi ${r.user.name},`,
      ``,
      `Your reservation ${r.code ?? ""} has been cancelled because we didn't receive the Zelle payment, so the slots have been released.`,
      ...(r.label ? [`Organization: ${r.label}`] : []),
      ``,
      ...r.bookings.map((b) => `  • ${b.resource.name} — ${b.date}, ${b.startHour}:00–${b.endHour}:00 — ${formatCents(b.totalCents)}`),
      ``,
      `Already paid, or want these times back? Reply to this email or book again: ${config.siteUrl}/book`,
      ``,
      `Infinity Sports Park — ${config.tagline}`,
    ].join("\n"),
  });
  redirect(returnTo + "?ok=" + encodeURIComponent(`Cancelled ${r.code ?? ""} for ${r.user.name}.`));
}

/** Confirm ALL of a user's pending-payment reservations at once. */
export async function confirmAllForUser(formData: FormData) {
  await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const returnTo = "/admin/bookings";
  if (!userId) redirect(returnTo);
  const pending = await prisma.reservation.findMany({
    where: { userId, kind: "BOOKING", status: "PENDING_PAYMENT" },
    include: confirmInclude,
  });
  for (const r of pending) await confirmOne(r);
  redirect(
    returnTo + "?ok=" + encodeURIComponent(`Confirmed ${pending.length} reservation(s) for ${pending[0]?.user.name ?? "user"}.`)
  );
}

/** Toggle the no-show flag on a booking. */
export async function toggleNoShow(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("bookingId") ?? "");
  const value = String(formData.get("noShow")) === "true";
  const returnTo = String(formData.get("returnTo") || "/admin/bookings");
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (booking && booking.status === "CONFIRMED") {
    await prisma.booking.update({ where: { id }, data: { noShow: value } });
  }
  redirect(returnTo + (returnTo.includes("?") ? "&" : "?") + "ok=" + encodeURIComponent(value ? "Marked no-show." : "Cleared no-show."));
}
