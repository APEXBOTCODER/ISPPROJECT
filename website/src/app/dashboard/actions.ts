"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { parkNow } from "@/lib/availability";
import { processRefund } from "@/lib/payments";
import { sendEmail } from "@/lib/email";
import { formatCents } from "@/lib/pricing";

/** Hours from now (park-local) until the booking starts. */
function hoursUntilStart(date: string, startHour: number): number {
  const now = parkNow();
  const dayDiff =
    (new Date(`${date}T00:00:00`).getTime() -
      new Date(`${now.date}T00:00:00`).getTime()) /
    86_400_000;
  return dayDiff * 24 + (startHour - now.hour);
}

function refundPercentFor(hoursAhead: number): number {
  if (hoursAhead >= config.cancellationPolicy.fullRefundHours) return 100;
  if (hoursAhead >= config.cancellationPolicy.halfRefundHours) return 50;
  return 0;
}

export async function cancelBooking(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const bookingId = String(formData.get("bookingId") ?? "");
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { resource: true },
  });

  // Authorization: only the owner may cancel, and only future confirmed bookings
  if (!booking || booking.userId !== session.user.id) {
    redirect("/dashboard?error=" + encodeURIComponent("Booking not found."));
  }
  if (booking.status !== "CONFIRMED") {
    redirect("/dashboard?error=" + encodeURIComponent("This booking cannot be cancelled."));
  }

  const hoursAhead = hoursUntilStart(booking.date, booking.startHour);
  if (hoursAhead <= 0) {
    redirect("/dashboard?error=" + encodeURIComponent("Past bookings cannot be cancelled."));
  }

  const refundPercent = refundPercentFor(hoursAhead);
  const refundCents = Math.round((booking.totalCents * refundPercent) / 100);

  if (refundCents > 0 && booking.paymentRef) {
    const refund = await processRefund({
      paymentRef: booking.paymentRef,
      amountCents: refundCents,
    });
    if (!refund.ok) {
      redirect("/dashboard?error=" + encodeURIComponent(refund.error));
    }
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        notes: `Cancelled by customer · ${refundPercent}% refund (${formatCents(refundCents)})`,
      },
    }),
    prisma.bookingSlot.deleteMany({ where: { bookingId: booking.id } }),
  ]);

  await sendEmail({
    to: session.user.email ?? "",
    subject: `Booking cancelled — ${booking.resource.name} on ${booking.date}`,
    text: [
      `Your booking has been cancelled.`,
      ``,
      `  Facility: ${booking.resource.name}`,
      `  Date:     ${booking.date}, ${booking.startHour}:00–${booking.endHour}:00`,
      `  Refund:   ${formatCents(refundCents)} (${refundPercent}% per our cancellation policy)`,
      ``,
      `Book again any time: ${config.siteUrl}/book`,
    ].join("\n"),
  });

  redirect("/dashboard?cancelled=1");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
