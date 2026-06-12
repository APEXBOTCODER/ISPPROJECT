"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { slotKey } from "@/lib/availability";
import { processRefund } from "@/lib/payments";
import { sendEmail } from "@/lib/email";
import { formatCents } from "@/lib/pricing";

const blockSchema = z.object({
  resourceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(1).max(24),
  reason: z.string().max(200).optional(),
});

/** Block a range of slots for maintenance — modeled as a BLOCKED booking so
 *  the same unique constraint protects it from racing customer checkouts. */
export async function createBlock(formData: FormData) {
  const staff = await requireStaff();

  const parsed = blockSchema.safeParse({
    resourceId: formData.get("resourceId"),
    date: formData.get("date"),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success || parsed.data.endHour <= parsed.data.startHour) {
    redirect("/admin?error=" + encodeURIComponent("Invalid block range."));
  }
  const input = parsed.data;
  const hours = Array.from(
    { length: input.endHour - input.startHour },
    (_, i) => input.startHour + i
  );

  try {
    await prisma.$transaction(async (tx) => {
      const block = await tx.booking.create({
        data: {
          userId: staff.id,
          resourceId: input.resourceId,
          date: input.date,
          startHour: input.startHour,
          endHour: input.endHour,
          status: "BLOCKED",
          notes: input.reason ?? "Maintenance block",
        },
      });
      await tx.bookingSlot.createMany({
        data: hours.map((hour) => ({
          bookingId: block.id,
          resourceId: input.resourceId,
          slotKey: slotKey(input.date, hour),
        })),
      });
    });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") {
      redirect(
        "/admin?error=" +
          encodeURIComponent("Cannot block — one or more slots already have a booking. Cancel it first.")
      );
    }
    throw error;
  }

  redirect("/admin?ok=" + encodeURIComponent("Block created."));
}

export async function removeBlock(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("blockId") ?? "");
  const block = await prisma.booking.findUnique({ where: { id } });
  if (block?.status === "BLOCKED") {
    await prisma.booking.delete({ where: { id } }); // slots cascade
  }
  redirect("/admin?ok=" + encodeURIComponent("Block removed."));
}

/** Staff cancellation always issues a full refund. */
export async function adminCancelBooking(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("bookingId") ?? "");
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { user: true, resource: true },
  });
  if (!booking || booking.status !== "CONFIRMED") {
    redirect("/admin?error=" + encodeURIComponent("Booking not found or not cancellable."));
  }

  if (booking.paymentRef) {
    await processRefund({
      paymentRef: booking.paymentRef,
      amountCents: booking.totalCents,
    });
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED", notes: "Cancelled by staff · full refund" },
    }),
    prisma.bookingSlot.deleteMany({ where: { bookingId: id } }),
  ]);

  await sendEmail({
    to: booking.user.email,
    subject: `Booking cancelled by Infinity Sports Park — ${booking.resource.name} on ${booking.date}`,
    text: `Your booking on ${booking.date} (${booking.startHour}:00–${booking.endHour}:00) was cancelled by our staff. A full refund of ${formatCents(booking.totalCents)} has been issued. We apologize for the inconvenience.`,
  });

  redirect("/admin?ok=" + encodeURIComponent("Booking cancelled and refunded."));
}
