"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const roleSchema = z.enum(["CUSTOMER", "STAFF", "ADMIN"]);
const passwordSchema = z.string().min(8, "Temporary password must be at least 8 characters.").max(100);
const profileSchema = z.object({
  name: z.string().min(2, "Name is too short.").max(100),
  email: z.string().email("Enter a valid email address.").max(200),
});

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
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  back(userId, {
    ok: "Password reset. Share the temporary password with the user — they can sign in with it now.",
  });
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
