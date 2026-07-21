"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { formatCents } from "@/lib/pricing";
import { cancelUnpaidReservation } from "@/lib/availability";
import { getSettings } from "@/lib/settings";
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

/** Customer cancels their own unpaid (PENDING_PAYMENT) reservation. No refund —
 *  nothing was paid — the slots are simply released. */
export async function cancelPendingReservation(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const reservationId = String(formData.get("reservationId") ?? "");
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { userId: true, status: true },
  });
  if (!reservation || reservation.userId !== session.user.id) {
    redirect("/dashboard?error=" + encodeURIComponent("Reservation not found."));
  }
  if (reservation.status !== "PENDING_PAYMENT") {
    redirect("/dashboard?error=" + encodeURIComponent("This reservation can no longer be cancelled here."));
  }

  const result = await cancelUnpaidReservation(reservationId, "Cancelled by customer before payment");
  if (!result.ok) {
    redirect("/dashboard?error=" + encodeURIComponent("This reservation was already updated."));
  }
  const r = result.reservation;

  // Confirm to the customer, and let the admin know to stop expecting the Zelle payment.
  await sendEmail({
    to: r.user.email,
    subject: `Reservation ${r.code ?? ""} cancelled`,
    text: [
      `Hi ${r.user.name},`,
      ``,
      `Your unpaid reservation ${r.code ?? ""} has been cancelled and the slots released. No payment was taken.`,
      ``,
      `Changed your mind? Book again any time: ${config.siteUrl}/book`,
    ].join("\n"),
  });
  const settings = await getSettings();
  const adminEmail = settings["notify.adminEmail"];
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `Booking request ${r.code ?? ""} cancelled by customer — do not expect payment`,
      text: [
        `${r.user.name} (${r.user.email}) cancelled their unpaid reservation ${r.code ?? ""} before paying.`,
        ...(r.label ? [`Organization: ${r.label}`] : []),
        ...r.bookings.map((b) => `  • ${b.resource.name} — ${b.date}, ${b.startHour}:00–${b.endHour}:00 — ${formatCents(b.totalCents)}`),
        ``,
        `The slots have been released. No action needed.`,
      ].join("\n"),
    });
  }

  redirect("/dashboard?cancelled=1");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
