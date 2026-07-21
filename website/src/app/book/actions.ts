"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { priceForHours, formatCents } from "@/lib/pricing";
import { parkNow, slotKey, findSlotConflicts } from "@/lib/availability";
import { sendEmail } from "@/lib/email";
import { hasCurrentWaiver } from "@/lib/waiver";
import { hasVerifiedEmail } from "@/lib/verification";
import { getBookingPolicy } from "@/lib/policy";
import { minHoursForDate, MIN_DURATION_MESSAGE } from "@/lib/bookingRules";
import { getSettings } from "@/lib/settings";
import { makeReservationCode } from "@/lib/reservationCode";
import { findActiveCode, alreadyRedeemed, discountForHours } from "@/lib/discounts";

async function uniqueReservationCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = makeReservationCode();
    if (!(await prisma.reservation.findUnique({ where: { code } }))) return code;
  }
  return `ISP-${Date.now().toString(36).toUpperCase()}`;
}

// Hard safety bounds; the *policy* caps (maxHoursPerSegment / maxSegmentsPerReservation)
// are enforced inside createReservation against the live booking policy.
const segmentSchema = z.object({
  resourceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.array(z.number().int().min(0).max(23)).min(1).max(24),
});

const reservationSchema = z.object({
  segments: z.array(segmentSchema).min(1).max(90),
  label: z.string().max(120).optional(),
});

function isContiguous(hours: number[]): boolean {
  const sorted = [...hours].sort((a, b) => a - b);
  return sorted.every((h, i) => i === 0 || h === sorted[i - 1] + 1);
}

function bail(message: string): never {
  redirect("/book?error=" + encodeURIComponent(message));
}

type PreparedSegment = {
  resourceId: string;
  resourceName: string;
  date: string;
  hours: number[];
  startHour: number;
  endHour: number;
  totalCents: number;
};

/**
 * Create a reservation of one or more day-segments (each: facility + date +
 * contiguous hours) and take a single payment for the whole thing. All segments
 * are held in one transaction — a slot collision (unique constraint, P2002)
 * rolls back the entire reservation, so it's all-or-nothing.
 */
export async function createReservation(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  let rawSegments: unknown = [];
  try {
    rawSegments = JSON.parse(String(formData.get("segments") ?? "[]"));
  } catch {
    bail("Invalid reservation — please rebuild your selection.");
  }

  const parsed = reservationSchema.safeParse({
    segments: rawSegments,
    label: formData.get("label") || undefined,
  });
  if (!parsed.success) {
    bail("Please add at least one valid day to your reservation.");
  }
  const { segments, label } = parsed.data;

  const policy = await getBookingPolicy();
  if (segments.length > policy.maxSegmentsPerReservation) {
    bail(`A reservation can include at most ${policy.maxSegmentsPerReservation} days.`);
  }
  if (segments.some((s) => s.hours.length > policy.maxHoursPerSegment)) {
    bail(`Each day can be at most ${policy.maxHoursPerSegment} consecutive hours.`);
  }

  // Verified email + current waiver gates (same as single-day booking).
  if (!(await hasVerifiedEmail(userId))) {
    redirect(`/verify?next=${encodeURIComponent("/book")}`);
  }
  if (!(await hasCurrentWaiver(userId))) {
    redirect(`/waiver?next=${encodeURIComponent("/book")}`);
  }

  const now = parkNow();
  const maxDate = new Date(`${now.date}T00:00:00`);
  maxDate.setDate(maxDate.getDate() + policy.advanceBookingDays);
  const maxDateStr = maxDate.toISOString().slice(0, 10);

  // Load every referenced resource once.
  const resourceIds = Array.from(new Set(segments.map((s) => s.resourceId)));
  const resources = await prisma.resource.findMany({
    where: { id: { in: resourceIds } },
  });
  const resourceById = new Map(resources.map((r) => [r.id, r]));

  const prepared: PreparedSegment[] = [];
  const seenSlots = new Set<string>();

  for (const seg of segments) {
    const resource = resourceById.get(seg.resourceId);
    if (!resource || !resource.active) {
      bail("One of the selected facilities is not available.");
    }
    const sortedHours = [...seg.hours].sort((a, b) => a - b);
    if (!isContiguous(sortedHours)) {
      bail("Each day must be a single set of consecutive hours.");
    }
    if (
      seg.date < now.date ||
      seg.date > maxDateStr ||
      (seg.date === now.date && sortedHours[0] <= now.hour) ||
      sortedHours[0] < resource.openHour ||
      sortedHours[sortedHours.length - 1] >= resource.closeHour
    ) {
      bail(`A selected time on ${seg.date} is outside the bookable window.`);
    }
    if (sortedHours.length < minHoursForDate(seg.date)) {
      bail(MIN_DURATION_MESSAGE);
    }
    // Reject duplicate slots within the same reservation.
    for (const h of sortedHours) {
      const key = `${seg.resourceId}:${slotKey(seg.date, h)}`;
      if (seenSlots.has(key)) {
        bail("Your reservation includes the same slot twice — remove the duplicate.");
      }
      seenSlots.add(key);
    }

    prepared.push({
      resourceId: resource.id,
      resourceName: resource.name,
      date: seg.date,
      hours: sortedHours,
      startHour: sortedHours[0],
      endHour: sortedHours[sortedHours.length - 1] + 1,
      totalCents: priceForHours(resource, seg.date, sortedHours),
    });
  }

  // Apply a discount code if one was entered (re-validated here, authoritative).
  // The discount is allocated across the day-segments so each booking's stored
  // total (and therefore revenue) reflects it and still sums to the amount due.
  let discountCode: string | null = null;
  let discountCents = 0;
  const rawCode = String(formData.get("discountCode") ?? "").trim();
  if (rawCode) {
    const found = await findActiveCode(rawCode);
    if (!found) bail("That discount code isn't valid.");
    if (found.oncePerUser && (await alreadyRedeemed(userId, found.code))) {
      bail("You've already used that discount code.");
    }
    const totalHours = prepared.reduce((s, p) => s + p.hours.length, 0);
    const grandFull = prepared.reduce((s, p) => s + p.totalCents, 0);
    discountCents = Math.min(discountForHours(found, totalHours), grandFull);
    discountCode = found.code;
    let remaining = discountCents;
    prepared.forEach((p, i) => {
      const share =
        i === prepared.length - 1
          ? remaining
          : Math.min(remaining, Math.round((discountCents * p.totalCents) / grandFull));
      p.totalCents = Math.max(0, p.totalCents - share);
      remaining -= share;
    });
  }

  const grandTotal = prepared.reduce((sum, s) => sum + s.totalCents, 0);
  const segmentCount = prepared.length;
  const code = await uniqueReservationCode();

  // Create the reservation in PENDING_PAYMENT: slots are held (double-book guard)
  // but it isn't confirmed until staff verify the offline (Zelle) payment.
  let reservationId: string;
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.create({
        data: {
          userId,
          code,
          kind: "BOOKING",
          label: label ?? null,
          totalCents: grandTotal,
          status: "PENDING_PAYMENT",
          discountCode,
          discountCents,
        },
      });
      for (const seg of prepared) {
        const booking = await tx.booking.create({
          data: {
            userId,
            reservationId: res.id,
            resourceId: seg.resourceId,
            date: seg.date,
            startHour: seg.startHour,
            endHour: seg.endHour,
            status: "PENDING_PAYMENT",
            totalCents: seg.totalCents,
          },
        });
        await tx.bookingSlot.createMany({
          data: seg.hours.map((hour) => ({
            bookingId: booking.id,
            resourceId: seg.resourceId,
            slotKey: slotKey(seg.date, hour),
          })),
        });
      }
      return res;
    });
    reservationId = reservation.id;
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") {
      const conflicts = await findSlotConflicts(prepared);
      bail(
        conflicts.length
          ? `No longer available — just booked by someone else: ${conflicts.join("; ")}. Remove or change those and try again.`
          : "One of those slots was just taken — please adjust your selection."
      );
    }
    throw error;
  }

  // Offline payment: email the Zelle instructions. Staff confirm on receipt.
  const settings = await getSettings();
  const zelleEmail = settings["payment.zelleEmail"];
  const zelleName = settings["payment.zelleName"];
  await sendEmail({
    to: session.user.email ?? "",
    subject: `Reservation ${code} — payment pending (${formatCents(grandTotal)})`,
    text: [
      `Hi ${session.user.name ?? "there"},`,
      ``,
      `Thanks! Your ${segmentCount === 1 ? "booking" : "reservation"} is held and awaiting payment.`,
      `Reservation ID: ${code}   (status: Pending payment verification)`,
      ...(label ? [`Organization: ${label}`] : []),
      ``,
      ...prepared.map(
        (s) => `  • ${s.resourceName} — ${s.date}, ${s.startHour}:00–${s.endHour}:00 (US Central) — ${formatCents(s.totalCents)}`
      ),
      ``,
      ...(discountCents > 0 ? [`  Discount (${discountCode}): -${formatCents(discountCents)}`] : []),
      `  Amount due: ${formatCents(grandTotal)}`,
      ``,
      `HOW TO PAY (Zelle):`,
      `  Send ${formatCents(grandTotal)} via Zelle to ${zelleEmail}`,
      `  Zelle name: ${zelleName}`,
      `  IMPORTANT: put your Reservation ID "${code}" in the Zelle memo so we can match your payment.`,
      ``,
      `Once we receive your payment we'll confirm the reservation and email you a confirmation.`,
      ``,
      `View it any time: ${config.siteUrl}/dashboard`,
      ``,
      `Infinity Sports Park — ${config.tagline}`,
    ].join("\n"),
  });

  // Notify the admin inbox of the new booking request (so they can watch for the Zelle payment).
  const adminEmail = settings["notify.adminEmail"];
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `New booking request ${code} — ${formatCents(grandTotal)} (awaiting Zelle)`,
      text: [
        `New booking request awaiting Zelle payment.`,
        ``,
        `Customer: ${session.user.name ?? "—"} (${session.user.email ?? "—"})`,
        `Reservation ID: ${code}`,
        ...(label ? [`Organization: ${label}`] : []),
        ``,
        ...prepared.map(
          (s) => `  • ${s.resourceName} — ${s.date}, ${s.startHour}:00–${s.endHour}:00 — ${formatCents(s.totalCents)}`
        ),
        ``,
        `  Amount due: ${formatCents(grandTotal)}`,
        `  Zelle memo to match: ${code}`,
        ``,
        `Confirm once payment arrives: ${config.siteUrl}/admin/bookings`,
      ].join("\n"),
    });
  }

  redirect(`/book/confirmation/${reservationId}`);
}
