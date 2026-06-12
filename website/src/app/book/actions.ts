"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { priceForHours } from "@/lib/pricing";
import { parkNow, slotKey } from "@/lib/availability";
import { processPayment } from "@/lib/payments";
import { sendEmail } from "@/lib/email";
import { hasCurrentWaiver } from "@/lib/waiver";

const bookingSchema = z.object({
  resourceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.array(z.number().int().min(0).max(23)).min(1).max(6),
});

function isContiguous(hours: number[]): boolean {
  const sorted = [...hours].sort((a, b) => a - b);
  return sorted.every((h, i) => i === 0 || h === sorted[i - 1] + 1);
}

export async function createBooking(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  let hours: number[] = [];
  try {
    hours = JSON.parse(String(formData.get("hours") ?? "[]"));
  } catch {
    redirect("/book?error=" + encodeURIComponent("Invalid slot selection"));
  }

  const parsed = bookingSchema.safeParse({
    resourceId: formData.get("resourceId"),
    date: formData.get("date"),
    hours,
  });
  if (!parsed.success || !isContiguous(parsed.data.hours)) {
    redirect("/book?error=" + encodeURIComponent("Please select a valid set of consecutive hourly slots."));
  }
  const input = parsed.data;
  const sortedHours = [...input.hours].sort((a, b) => a - b);

  // Waiver gate: a current signed waiver is required before payment (spec §7)
  if (!(await hasCurrentWaiver(userId))) {
    redirect(`/waiver?next=${encodeURIComponent("/book")}`);
  }

  const resource = await prisma.resource.findUnique({
    where: { id: input.resourceId },
  });
  if (!resource || !resource.active) {
    redirect("/book?error=" + encodeURIComponent("That facility is not available."));
  }

  // Validate window: future slots only, within the advance-booking window
  const now = parkNow();
  const maxDate = new Date(`${now.date}T00:00:00`);
  maxDate.setDate(maxDate.getDate() + config.advanceBookingDays);
  const maxDateStr = maxDate.toISOString().slice(0, 10);
  if (
    input.date < now.date ||
    input.date > maxDateStr ||
    (input.date === now.date && sortedHours[0] <= now.hour) ||
    sortedHours[0] < resource.openHour ||
    sortedHours[sortedHours.length - 1] >= resource.closeHour
  ) {
    redirect("/book?error=" + encodeURIComponent("Selected time is outside the bookable window."));
  }

  const totalCents = priceForHours(resource, input.date, sortedHours);

  // Create the hold: booking + slot rows in one transaction. The unique
  // constraint on (resourceId, slotKey) makes concurrent double-booking
  // impossible — the second transaction fails with P2002.
  let bookingId: string;
  try {
    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          userId,
          resourceId: resource.id,
          date: input.date,
          startHour: sortedHours[0],
          endHour: sortedHours[sortedHours.length - 1] + 1,
          status: "PENDING",
          totalCents,
        },
      });
      await tx.bookingSlot.createMany({
        data: sortedHours.map((hour) => ({
          bookingId: created.id,
          resourceId: resource.id,
          slotKey: slotKey(input.date, hour),
        })),
      });
      return created;
    });
    bookingId = booking.id;
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      redirect(
        "/book?error=" +
          encodeURIComponent("One of those slots was just taken — please pick another time.")
      );
    }
    throw error;
  }

  // Take payment (mock or Stripe per PAYMENTS_PROVIDER)
  const payment = await processPayment({
    amountCents: totalCents,
    description: `${resource.name} on ${input.date}, ${sortedHours[0]}:00–${sortedHours[sortedHours.length - 1] + 1}:00`,
    customerEmail: session.user.email ?? "",
  });

  if (!payment.ok) {
    // Release the hold
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", notes: `Payment failed: ${payment.error}` },
    });
    await prisma.bookingSlot.deleteMany({ where: { bookingId } });
    redirect("/book?error=" + encodeURIComponent(payment.error));
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CONFIRMED", paymentRef: payment.ref },
  });

  await sendEmail({
    to: session.user.email ?? "",
    subject: `Booking confirmed — ${resource.name} on ${input.date}`,
    text: [
      `Hi ${session.user.name ?? "there"},`,
      ``,
      `Your booking is confirmed!`,
      ``,
      `  Facility: ${resource.name}`,
      `  Date:     ${input.date}`,
      `  Time:     ${sortedHours[0]}:00 – ${sortedHours[sortedHours.length - 1] + 1}:00 (US Central)`,
      `  Total:    $${(totalCents / 100).toFixed(2)}`,
      `  Ref:      ${payment.ref}`,
      ``,
      `Manage or cancel this booking any time: ${config.siteUrl}/dashboard`,
      ``,
      `See you on the field!`,
      `Infinity Sports Park — ${config.tagline}`,
    ].join("\n"),
  });

  redirect(`/book/confirmation/${bookingId}`);
}
