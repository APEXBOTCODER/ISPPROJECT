"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const roleSchema = z.enum(["CUSTOMER", "STAFF", "ADMIN"]);

function back(userId: string, params: Record<string, string>): never {
  redirect(`/admin/users/${userId}?` + new URLSearchParams(params).toString());
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
