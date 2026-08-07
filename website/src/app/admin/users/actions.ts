"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdmin, requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { formatCents } from "@/lib/pricing";
import { generateUserInvoice, invoiceFilename } from "@/lib/invoice";
import { recordPayment, recordAdvancePayment, setReservationPaid, applyAdvanceToReservation, deletePayment } from "@/lib/installments";

/** Parse a dollars string ("125", "125.50") to integer cents, or null if invalid. */
function dollarsToCents(raw: string): number | null {
  const s = raw.trim();
  if (!s || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

const roleSchema = z.enum(["CUSTOMER", "STAFF", "ADMIN"]);
const passwordSchema = z.string().min(8, "Temporary password must be at least 8 characters.").max(100);
const profileSchema = z.object({
  name: z.string().min(2, "Name is too short.").max(100),
  email: z.string().email("Enter a valid email address.").max(200),
});
const createSchema = z.object({
  name: z.string().min(2, "Name is too short.").max(100),
  email: z.string().email("Enter a valid email address.").max(200),
  role: z.enum(["CUSTOMER", "STAFF", "ADMIN"]),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128).optional(),
});

/** Create a new user account. ADMIN-only. Password is optional — leave it blank
 *  to register an organization/person that won't log in (e.g. for bulk bookings). */
export async function createUser(formData: FormData) {
  await requireAdmin();
  const password = String(formData.get("password") ?? "").trim() || undefined;
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").toLowerCase(),
    role: formData.get("role") || "CUSTOMER",
    password,
  });
  if (!parsed.success) {
    redirect("/admin/users?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input."));
  }
  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    redirect("/admin/users?error=" + encodeURIComponent("An account with that email already exists."));
  }
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : undefined,
      emailVerified: new Date(), // admin-created accounts are trusted
    },
  });
  redirect(`/admin/users/${user.id}?ok=` + encodeURIComponent("User created."));
}

function back(userId: string, params: Record<string, string>): never {
  redirect(`/admin/users/${userId}?` + new URLSearchParams(params).toString());
}

/** Update a user's display name and email. ADMIN-only. Useful for registering an
 *  organization/person as an account so bulk bookings can be attributed to them. */
export async function updateUserProfile(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin/users");
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").toLowerCase(),
  });
  if (!parsed.success) back(userId, { error: parsed.error.issues[0]?.message ?? "Invalid input." });

  const clash = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (clash && clash.id !== userId) {
    back(userId, { error: "That email is already used by another account." });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name, email: parsed.data.email },
  });
  back(userId, { ok: "Profile updated." });
}

/** Change a user's role. ADMIN-only; cannot change your own role. */
export async function setUserRole(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const parsed = roleSchema.safeParse(formData.get("role"));
  if (!userId) redirect("/admin/users");
  if (!parsed.success) back(userId, { error: "Invalid role." });
  if (userId === admin.id) back(userId, { error: "You can't change your own role." });

  await prisma.user.update({ where: { id: userId }, data: { role: parsed.data } });
  back(userId, { ok: `Role updated to ${parsed.data}.` });
}

/** Deactivate or reactivate an account. ADMIN-only; can't deactivate yourself.
 *  Deactivated users can't log in or book; existing sessions are locked out on
 *  their next request. Fully reversible — all history is preserved. */
export async function setUserActive(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin/users");
  const active = String(formData.get("active")) === "true";

  if (userId === admin.id && !active) {
    back(userId, { error: "You can't deactivate your own account." });
  }

  await prisma.user.update({ where: { id: userId }, data: { active } });
  back(userId, { ok: active ? "Account reactivated." : "Account deactivated — the user can no longer sign in or book." });
}

/**
 * Reset a user's login by setting a new temporary password. ADMIN-only.
 * Use when a user is locked out / forgot their password: set a temp password,
 * share it with them securely, and they can sign in immediately. Also gives a
 * password to accounts that only had social sign-in.
 */
export async function resetUserPassword(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin/users");
  const parsed = passwordSchema.safeParse(String(formData.get("password") ?? ""));
  if (!parsed.success) back(userId, { error: parsed.error.issues[0]?.message ?? "Invalid password." });

  const passwordHash = await bcrypt.hash(parsed.data, 12);
  // Stamp passwordChangedAt so any existing sessions for this user are invalidated.
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } });
  back(userId, {
    ok: "Password reset. Share the temporary password with the user — they can sign in with it now.",
  });
}

/**
 * Email the user their invoice PDF for a date range. Staff-only. The PDF is
 * always sent to the account's OWN email from the database — never an address
 * from the form — so this can't be used as a spam relay or to exfiltrate data.
 */
export async function emailInvoice(formData: FormData) {
  await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin/users");

  const result = await generateUserInvoice(
    userId,
    String(formData.get("from") ?? ""),
    String(formData.get("to") ?? "")
  );
  if (!result) back(userId, { error: "User not found." });
  const { pdf, user, from, to, count } = result;

  await sendEmail({
    to: user.email,
    subject: `Your ${config.siteName} invoice (${from} to ${to})`,
    text: [
      `Hi ${user.name},`,
      ``,
      count > 0
        ? `Attached is your invoice for ${count} booking(s) between ${from} and ${to}.`
        : `Attached is your invoice for ${from} to ${to}. You have no confirmed bookings in this period.`,
      ``,
      `Questions? Just reply to this email.`,
      `${config.siteName}`,
    ].join("\n"),
    attachments: [{ filename: invoiceFilename(user.name, from, to), content: pdf, contentType: "application/pdf" }],
  });

  back(userId, { ok: `Invoice emailed to ${user.email}.` });
}

/**
 * Permanently delete a user account. ADMIN-only, and only when the account has
 * NO history (no bookings, reservations, waivers, or refunds) — anything with
 * history must be deactivated instead so records are preserved. Cleans up the
 * account's verification codes / reset tokens, then deletes the user.
 */
export async function deleteUser(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin/users");
  if (userId === admin.id) back(userId, { error: "You can't delete your own account." });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) redirect("/admin/users");

  const [bookings, reservations, waivers, refunds] = await Promise.all([
    prisma.booking.count({ where: { userId } }),
    prisma.reservation.count({ where: { userId } }),
    prisma.waiverSignature.count({ where: { userId } }),
    prisma.refundRecord.count({ where: { OR: [{ userId }, { staffId: userId }] } }),
  ]);
  if (bookings + reservations + waivers + refunds > 0) {
    back(userId, {
      error: "This account has bookings, reservations, waivers, or refund history — deactivate it instead to keep those records.",
    });
  }

  await prisma.$transaction([
    prisma.verificationCode.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  redirect(`/admin/users?ok=${encodeURIComponent(`Deleted ${user.name}.`)}`);
}

/**
 * Reset (turn off) a user's two-factor authentication so they can re-enroll —
 * e.g. a locked-out staff member who lost their phone and backup codes.
 * ADMIN-only. It does NOT weaken their password; they log in with password only
 * until they set 2FA up again from their Security page.
 */
export async function resetUserTwoFactor(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin/users");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) redirect("/admin/users");

  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodes: null },
  });
  back(userId, { ok: `Two-factor reset for ${user.name} — ask them to set it up again from My Account → Security.` });
}

/**
 * Record a payment on a user's account. Staff-only. Two modes:
 *  - "advance": an account-level prepayment/credit (no specific booking).
 *  - a reservationId: a payment against that reservation (deposit/installment).
 */
export async function recordUserPayment(formData: FormData) {
  const staff = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin/users");

  const cents = dollarsToCents(String(formData.get("amount") ?? ""));
  if (cents === null || cents <= 0) back(userId, { error: "Enter a valid dollar amount." });
  const method = String(formData.get("method") ?? "ZELLE");
  const note = String(formData.get("note") ?? "").trim() || null;
  const target = String(formData.get("target") ?? "advance"); // "advance" | reservationId
  const source = String(formData.get("source") ?? "new"); // "new" | "advance"

  // Pay a reservation's balance FROM the customer's advance credit.
  if (target !== "advance" && source === "advance") {
    const applied = await applyAdvanceToReservation({ reservationId: target, amountCents: cents, staffId: staff.id });
    if (!applied.ok) back(userId, { error: applied.error });
    back(userId, { ok: `Applied ${formatCents(applied.amountCents)} from advance balance. Any remaining balance stays due.` });
  }

  const result =
    target === "advance"
      ? await recordAdvancePayment({ userId, amountCents: cents, method, note, staffId: staff.id })
      : await recordPayment({ reservationId: target, amountCents: cents, method, note, staffId: staff.id });
  if (!result.ok) back(userId, { error: result.error });
  back(userId, {
    ok:
      target === "advance"
        ? `Recorded ${formatCents(result.amountCents)} advance/credit.`
        : `Recorded ${formatCents(result.amountCents)} payment.`,
  });
}

/** Reverse/delete a recorded payment to fix a mistake. ADMIN-only. */
export async function removePayment(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin/users");
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) back(userId, { error: "Missing payment." });

  const result = await deletePayment(paymentId);
  if (!result.ok) back(userId, { error: result.error });
  back(userId, { ok: `Removed ${formatCents(result.amountCents)} payment.` });
}

/** Correct how much has been paid on a NON-plan reservation. ADMIN-only. */
export async function fixReservationPaid(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin/users");
  const reservationId = String(formData.get("reservationId") ?? "");
  const cents = dollarsToCents(String(formData.get("amount") ?? ""));
  if (cents === null) back(userId, { error: "Enter a valid dollar amount." });

  const result = await setReservationPaid({ reservationId, amountCents: cents });
  if (!result.ok) back(userId, { error: result.error });
  back(userId, { ok: `Updated paid amount to ${formatCents(result.paidCents)}.` });
}

/** Manually set/clear a user's email verification. ADMIN-only. */
export async function setManualVerified(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) redirect("/admin/users");
  const verified = String(formData.get("verified")) === "true";

  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: verified ? new Date() : null },
  });
  back(userId, { ok: verified ? "Email marked verified." : "Email verification cleared." });
}
