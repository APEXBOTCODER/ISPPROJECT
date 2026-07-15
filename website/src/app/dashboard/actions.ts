"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { formatCents } from "@/lib/pricing";
import {
  hoursUntilStart,
  refundBookingAdvanced,
  refundReservationPolicy,
} from "@/lib/reservations";
import { getBookingPolicy, refundPercentForPolicy } from "@/lib/policy";

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

  const outstanding = Math.max(0, booking.totalCents - booking.refundedCents);
  const policy = await getBookingPolicy();
  const percent = refundPercentForPolicy(hoursAhead, policy);
  const refundAmount = Math.round((outstanding * percent) / 100);

  const result = await refundBookingAdvanced(bookingId, {
    amountCents: refundAmount,
    cancel: true,
    reason: "Customer cancellation",
    staffId: session.user.id,
  });
  if (!result.ok) {
    redirect("/dashboard?error=" + encodeURIComponent(result.error));
  }

  await sendEmail({
    to: session.user.email ?? "",
    subject: `Booking cancelled — ${booking.resource.name} on ${booking.date}`,
    text: [
      `Your booking has been cancelled.`,
      ``,
      `  Facility: ${booking.resource.name}`,
      `  Date:     ${booking.date}, ${booking.startHour}:00–${booking.endHour}:00`,
      `  Refund:   ${formatCents(result.refundCents)} (${percent}% per our cancellation policy)`,
      ``,
      `Book again any time: ${config.siteUrl}/book`,
    ].join("\n"),
  });

  redirect("/dashboard?cancelled=1");
}

/** Cancel every still-active segment of one of the user's reservations (policy refund). */
export async function cancelReservation(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const reservationId = String(formData.get("reservationId") ?? "");
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation || reservation.userId !== session.user.id) {
    redirect("/dashboard?error=" + encodeURIComponent("Reservation not found."));
  }

  const result = await refundReservationPolicy(reservationId, session.user.id);
  if (result.count === 0) {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent(result.errors[0] ?? "Nothing to cancel — no active sessions.")
    );
  }

  await sendEmail({
    to: session.user.email ?? "",
    subject: `Reservation cancelled — Infinity Sports Park`,
    text: [
      `Your reservation has been cancelled.`,
      ``,
      `  ${result.count} session(s) cancelled`,
      `  Refund: ${formatCents(result.refundCents)} (per our cancellation policy)`,
      ``,
      `Book again any time: ${config.siteUrl}/book`,
    ].join("\n"),
  });

  redirect("/dashboard?cancelled=1");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
