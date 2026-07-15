"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { slotKey } from "@/lib/availability";

const blockSchema = z
  .object({
    resourceId: z.string().min(1),
    startHour: z.coerce.number().int().min(0).max(23),
    endHour: z.coerce.number().int().min(1).max(24),
    reason: z.string().max(200).optional(),
  })
  .refine((b) => b.endHour > b.startHour, { message: "End hour must be after start hour." });

/** Block one or more (not necessarily contiguous) days for maintenance. Modeled
 *  as BLOCKED bookings grouped under a Reservation(kind=BLOCK), so the same unique
 *  constraint protects them from racing customer checkouts. */
export async function createBlock(formData: FormData) {
  const staff = await requireStaff();

  const parsed = blockSchema.safeParse({
    resourceId: formData.get("resourceId"),
    startHour: formData.get("startHour"),
    endHour: formData.get("endHour"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    redirect("/admin/maintenance?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid block."));
  }
  const input = parsed.data;

  let rawDates: unknown = [];
  try {
    rawDates = JSON.parse(String(formData.get("dates") ?? "[]"));
  } catch {
    redirect("/admin/maintenance?error=" + encodeURIComponent("Invalid dates."));
  }
  const dates = Array.from(
    new Set((Array.isArray(rawDates) ? rawDates : []).filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)))
  ).sort();
  if (dates.length === 0) {
    redirect("/admin/maintenance?error=" + encodeURIComponent("Select at least one day to block."));
  }
  if (dates.length > 62) {
    redirect("/admin/maintenance?error=" + encodeURIComponent("Too many days (max 62)."));
  }
  const hours = Array.from(
    { length: input.endHour - input.startHour },
    (_, i) => input.startHour + i
  );
  const reason = input.reason ?? "Maintenance block";

  try {
    await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.create({
        data: { userId: staff.id, kind: "BLOCK", label: reason, status: "CONFIRMED" },
      });
      for (const date of dates) {
        const block = await tx.booking.create({
          data: {
            userId: staff.id,
            reservationId: reservation.id,
            resourceId: input.resourceId,
            date,
            startHour: input.startHour,
            endHour: input.endHour,
            status: "BLOCKED",
            notes: reason,
          },
        });
        await tx.bookingSlot.createMany({
          data: hours.map((hour) => ({
            bookingId: block.id,
            resourceId: input.resourceId,
            slotKey: slotKey(date, hour),
          })),
        });
      }
    });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") {
      redirect(
        "/admin/maintenance?error=" +
          encodeURIComponent("Cannot block — a slot in that range is already booked. Cancel it first.")
      );
    }
    throw error;
  }

  redirect(
    "/admin/maintenance?ok=" +
      encodeURIComponent(dates.length > 1 ? `Blocked ${dates.length} days.` : "Block created.")
  );
}

/** Remove a single day of a maintenance block. */
export async function removeBlock(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("blockId") ?? "");
  const block = await prisma.booking.findUnique({ where: { id } });
  if (block?.status === "BLOCKED") {
    await prisma.booking.delete({ where: { id } }); // slots cascade
  }
  redirect("/admin/maintenance?ok=" + encodeURIComponent("Block removed."));
}

/** Remove an entire multi-day maintenance block at once. */
export async function removeBlockGroup(formData: FormData) {
  await requireStaff();
  const reservationId = String(formData.get("reservationId") ?? "");
  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (reservation?.kind === "BLOCK") {
    await prisma.reservation.delete({ where: { id: reservationId } }); // bookings + slots cascade
  }
  redirect("/admin/maintenance?ok=" + encodeURIComponent("Block removed."));
}
