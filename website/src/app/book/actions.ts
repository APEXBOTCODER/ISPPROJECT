"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { priceForHours, formatCents } from "@/lib/pricing";
import { parkNow, slotKey, findSlotConflicts } from "@/lib/availability";
import { processPayment } from "@/lib/payments";
import { sendEmail } from "@/lib/email";
import { hasCurrentWaiver } from "@/lib/waiver";
import { hasVerifiedEmail } from "@/lib/verification";
import { getBookingPolicy } from "@/lib/policy";
import { minHoursForDate, MIN_DURATION_MESSAGE } from "@/lib/bookingRules";

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

  const grandTotal = prepared.reduce((sum, s) => sum + s.totalCents, 0);

  // Hold: reservation + one booking per segment + all slot rows, atomically.
  let reservationId: string;
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.create({
        data: {
          userId,
          kind: "BOOKING",
          label: label ?? null,
          totalCents: grandTotal,
          status: "PENDING",
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
            status: "PENDING",
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

  // One payment for the whole reservation.
  const segmentCount = prepared.length;
  const payment = await processPayment({
    amountCents: grandTotal,
    description:
      segmentCount === 1
        ? `${prepared[0].resourceName} on ${prepared[0].date}`
        : `Reservation — ${segmentCount} sessions`,
    customerEmail: session.user.email ?? "",
  });

  if (!payment.ok) {
    await prisma.$transaction([
      prisma.booking.updateMany({
        where: { reservationId },
        data: { status: "CANCELLED", notes: `Payment failed: ${payment.error}` },
      }),
      prisma.bookingSlot.deleteMany({ where: { booking: { reservationId } } }),
      prisma.reservation.update({
        where: { id: reservationId },
        data: { status: "CANCELLED", notes: `Payment failed: ${payment.error}` },
      }),
    ]);
    bail(payment.error);
  }

  await prisma.$transaction([
    prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "CONFIRMED", paymentRef: payment.ref },
    }),
    prisma.booking.updateMany({
      where: { reservationId },
      data: { status: "CONFIRMED", paymentRef: payment.ref },
    }),
  ]);

  await sendEmail({
    to: session.user.email ?? "",
    subject:
      segmentCount === 1
        ? `Booking confirmed — ${prepared[0].resourceName} on ${prepared[0].date}`
        : `Reservation confirmed — ${segmentCount} sessions at Infinity Sports Park`,
    text: [
      `Hi ${session.user.name ?? "there"},`,
      ``,
      segmentCount === 1 ? `Your booking is confirmed!` : `Your reservation is confirmed!`,
      ...(label ? [`Organization: ${label}`] : []),
      ``,
      ...prepared.map(
        (s) =>
          `  • ${s.resourceName} — ${s.date}, ${s.startHour}:00–${s.endHour}:00 (US Central) — ${formatCents(s.totalCents)}`
      ),
      ``,
      `  Total:  ${formatCents(grandTotal)}`,
      `  Ref:    ${payment.ref}`,
      ``,
      `Manage or cancel any time: ${config.siteUrl}/dashboard`,
      ``,
      `See you on the field!`,
      `Infinity Sports Park — ${config.tagline}`,
    ].join("\n"),
  });

  redirect(`/book/confirmation/${reservationId}`);
}
