"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { priceForHours, formatCents } from "@/lib/pricing";
import { parkNow, slotKey, findSlotConflicts, cancelUnpaidReservation } from "@/lib/availability";
import { getBookingPolicy } from "@/lib/policy";
import { sendEmail } from "@/lib/email";
import { config } from "@/lib/config";

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

  const policy = await getBookingPolicy();
  const now = parkNow();
  const maxDate = new Date(`${now.date}T00:00:00`);
  maxDate.setDate(maxDate.getDate() + policy.advanceBookingDays);
  const maxDateStr = maxDate.toISOString().slice(0, 10);

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
    if (hours.length > policy.maxHoursPerSegment) fail(returnTo, `Max ${policy.maxHoursPerSegment} hours per day.`);
    if (
      seg.date < now.date ||
      seg.date > maxDateStr ||
      (seg.date === now.date && hours[0] <= now.hour) ||
      hours[0] < resource.openHour ||
      hours[hours.length - 1] >= resource.closeHour
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
      totalCents: priceForHours(resource, seg.date, hours),
    });
  }

  const grandTotal = prepared.reduce((s, p) => s + p.totalCents, 0);
  const ref = `ADMIN-${randomUUID()}`;

  let reservationId: string;
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.create({
        data: {
          userId: customerId,
          kind: "BOOKING",
          label: String(formData.get("label") ?? "").slice(0, 120) || `Staff booking by ${staff.name}`,
          totalCents: grandTotal,
          status: "CONFIRMED",
          paymentRef: ref,
          notes: `Created by staff (${staff.email})`,
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
      ``,
      `Manage it any time: ${config.siteUrl}/dashboard`,
    ].join("\n"),
  });

  redirect(`/admin/bookings?ok=${encodeURIComponent(`Booked ${prepared.length} session(s) for ${customer.name}.`)}`);
}

/** Move one booking (segment) to a new date/start-hour on the same facility,
 *  keeping the same duration and price. Atomic slot swap. */
export async function rescheduleBooking(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("bookingId") ?? "");
  const returnTo = `/admin/bookings/${id}/reschedule`;
  const newDate = String(formData.get("date") ?? "");
  const newStart = Number(formData.get("startHour"));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !Number.isInteger(newStart)) {
    fail(returnTo, "Pick a valid date and start hour.");
  }

  const booking = await prisma.booking.findUnique({ where: { id }, include: { resource: true, user: true } });
  if (!booking || booking.status !== "CONFIRMED") fail(returnTo, "Only confirmed bookings can be rescheduled.");

  const duration = booking.endHour - booking.startHour;
  const newEnd = newStart + duration;
  const resource = booking.resource;

  const now = parkNow();
  const policy = await getBookingPolicy();
  const maxDate = new Date(`${now.date}T00:00:00`);
  maxDate.setDate(maxDate.getDate() + policy.advanceBookingDays);
  const maxDateStr = maxDate.toISOString().slice(0, 10);
  if (
    newDate < now.date ||
    newDate > maxDateStr ||
    (newDate === now.date && newStart <= now.hour) ||
    newStart < resource.openHour ||
    newEnd > resource.closeHour
  ) {
    fail(returnTo, "New time is outside the bookable window.");
  }

  const hours = Array.from({ length: duration }, (_, i) => newStart + i);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.bookingSlot.deleteMany({ where: { bookingId: id } });
      await tx.booking.update({
        where: { id },
        data: { date: newDate, startHour: newStart, endHour: newEnd },
      });
      await tx.bookingSlot.createMany({
        data: hours.map((h) => ({ bookingId: id, resourceId: resource.id, slotKey: slotKey(newDate, h) })),
      });
    });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") {
      fail(returnTo, "That new slot is already taken.");
    }
    throw error;
  }

  await sendEmail({
    to: booking.user.email,
    subject: `Booking rescheduled — ${resource.name}`,
    text: `Your ${resource.name} booking has been moved to ${newDate}, ${newStart}:00–${newEnd}:00 (US Central) by our staff.`,
  });

  redirect(`/admin/bookings?ok=${encodeURIComponent("Booking rescheduled.")}`);
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
    prisma.reservation.update({ where: { id: r.id }, data: { status: "CONFIRMED", paymentRef: ref } }),
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
