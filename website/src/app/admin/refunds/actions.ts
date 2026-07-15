"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { formatCents } from "@/lib/pricing";
import {
  refundBookingAdvanced,
  refundManyAdvanced,
  customRefundForUser,
} from "@/lib/reservations";

const reasonSchema = z.string().trim().min(3, "Please enter a reason.").max(300);

function back(base: string, params: Record<string, string>): never {
  redirect(base + "?" + new URLSearchParams(params).toString());
}

/** Email each affected customer that their session(s) were updated. Internal
 *  reason is never included. */
async function notifyAffected(bookingIds: string[]) {
  if (bookingIds.length === 0) return;
  const bookings = await prisma.booking.findMany({
    where: { id: { in: bookingIds } },
    include: { user: true, resource: true },
  });
  const byUser = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const arr = byUser.get(b.userId) ?? [];
    arr.push(b);
    byUser.set(b.userId, arr);
  }
  for (const [, list] of byUser) {
    const user = list[0].user;
    await sendEmail({
      to: user.email,
      subject: "Your booking was updated — Infinity Sports Park",
      text: [
        `Hi ${user.name},`,
        ``,
        `Our staff updated the following session(s):`,
        ...list.map(
          (b) => `  • ${b.resource.name} — ${b.date}, ${b.startHour}:00–${b.endHour}:00`
        ),
        ``,
        `Any eligible refund has been issued to your original payment method.`,
        ``,
        `Questions? Just reply to this email.`,
      ].join("\n"),
    });
  }
}

/** Refund selected reservations/segments — with reason, optional cancel, and an
 *  optional custom amount when exactly one item is selected. */
export async function bulkRefund(formData: FormData) {
  const staff = await requireStaff();
  const returnTo = String(formData.get("returnTo") || "/admin/bookings");

  let bookingIds: string[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("bookingIds") ?? "[]"));
    if (Array.isArray(parsed)) bookingIds = parsed.filter((x) => typeof x === "string");
  } catch {
    /* fall through to empty */
  }
  if (bookingIds.length === 0) back(returnTo, { error: "No bookings selected." });

  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!reason.success) back(returnTo, { error: reason.error.issues[0].message });

  const cancel = formData.get("cancel") != null; // checkbox present ⇒ checked
  const single = bookingIds.length === 1;
  const customStr = String(formData.get("customAmount") ?? "").trim();
  const useCustom = single && customStr !== "";
  const customCents = useCustom ? Math.round(parseFloat(customStr) * 100) : null;
  if (useCustom && (customCents === null || isNaN(customCents) || customCents < 0)) {
    back(returnTo, { error: "Enter a valid refund amount." });
  }

  let refundCents = 0;
  let count = 0;
  const errors: string[] = [];
  if (useCustom) {
    const r = await refundBookingAdvanced(bookingIds[0], {
      amountCents: customCents!,
      cancel,
      reason: reason.data,
      staffId: staff.id,
    });
    if (r.ok) {
      refundCents = r.refundCents;
      count = 1;
    } else errors.push(r.error);
  } else {
    const r = await refundManyAdvanced(
      { bookingIds },
      { cancel, reason: reason.data, staffId: staff.id }
    );
    refundCents = r.refundCents;
    count = r.count;
    errors.push(...r.errors);
  }

  if (count > 0) await notifyAffected(bookingIds);

  if (count === 0) {
    back(returnTo, { error: errors[0] ?? "Nothing was refunded." });
  }
  back(returnTo, {
    ok: `${count} item(s) processed · ${formatCents(refundCents)} refunded${
      cancel ? " · slot(s) freed" : ""
    }.`,
  });
}

/** Standalone goodwill/partial refund for a user, not tied to a booking. */
export async function customRefund(formData: FormData) {
  const staff = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) back("/admin/refunds", { error: "Select a user." });

  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!reason.success) back("/admin/refunds", { error: reason.error.issues[0].message, userId });

  const amountStr = String(formData.get("amount") ?? "").trim();
  const amountCents = Math.round(parseFloat(amountStr) * 100);
  if (isNaN(amountCents) || amountCents <= 0) {
    back("/admin/refunds", { error: "Enter a valid amount.", userId });
  }

  const result = await customRefundForUser({
    userId,
    amountCents,
    reason: reason.data,
    staffId: staff.id,
  });
  if (!result.ok) back("/admin/refunds", { error: result.error, userId });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) {
    await sendEmail({
      to: user.email,
      subject: "Refund issued — Infinity Sports Park",
      text: `Hi ${user.name},\n\nA refund of ${formatCents(result.refundCents)} has been issued to your original payment method.\n\nInfinity Sports Park`,
    });
  }

  back("/admin/refunds", {
    ok: `Custom refund of ${formatCents(result.refundCents)} issued.`,
    userId,
  });
}
