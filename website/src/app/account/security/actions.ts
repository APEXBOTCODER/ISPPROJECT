"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";
import {
  newSecretBase32,
  encryptSecret,
  decryptSecret,
  verifyTotp,
  newBackupCodes,
  hashBackupCodes,
  verifyAndConsumeSecondFactor,
} from "@/lib/twoFactor";

export type CodeState = { error?: string; backupCodes?: string[] };

function back(params: Record<string, string> = {}): never {
  const q = new URLSearchParams(params).toString();
  redirect("/account/security" + (q ? `?${q}` : ""));
}

/** Begin enrollment: generate + store an (encrypted) secret; 2FA stays OFF until
 *  the first code is confirmed. */
export async function startTotpSetup() {
  const u = await requireUser();
  const dbUser = await prisma.user.findUnique({ where: { id: u.id }, select: { totpEnabled: true } });
  if (dbUser?.totpEnabled) back({ error: "Two-factor is already on." });
  await prisma.user.update({
    where: { id: u.id },
    data: { totpSecret: encryptSecret(newSecretBase32()), totpEnabled: false, totpBackupCodes: null },
  });
  back();
}

/** Cancel a pending (not-yet-confirmed) setup. */
export async function cancelTotpSetup() {
  const u = await requireUser();
  await prisma.user.update({
    where: { id: u.id },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodes: null },
  });
  back();
}

/** Confirm the first code → enable 2FA and mint backup codes (shown once). */
export async function confirmTotp(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const u = await requireUser();
  if (!rateLimit(`totp-confirm:${await clientIp()}`, 15, 15 * 60_000).ok) {
    return { error: "Too many attempts — wait a few minutes." };
  }
  const code = String(formData.get("code") ?? "").trim();
  const dbUser = await prisma.user.findUnique({ where: { id: u.id }, select: { totpSecret: true, totpEnabled: true } });
  if (!dbUser?.totpSecret) return { error: "No pending setup — start again." };
  if (dbUser.totpEnabled) return { error: "Two-factor is already on." };

  let ok = false;
  try { ok = verifyTotp(decryptSecret(dbUser.totpSecret), code); } catch { ok = false; }
  if (!ok) return { error: "That code didn't match — check your app's time and try again." };

  const codes = newBackupCodes(10);
  await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: true, totpBackupCodes: hashBackupCodes(codes) } });
  return { backupCodes: codes };
}

/** Replace all backup codes (requires a current code). */
export async function regenerateBackupCodes(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const u = await requireUser();
  if (!rateLimit(`totp-regen:${await clientIp()}`, 10, 15 * 60_000).ok) {
    return { error: "Too many attempts — wait a few minutes." };
  }
  const code = String(formData.get("code") ?? "").trim();
  const dbUser = await prisma.user.findUnique({
    where: { id: u.id },
    select: { id: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true },
  });
  if (!dbUser?.totpEnabled) return { error: "Two-factor isn't on." };
  if (!(await verifyAndConsumeSecondFactor(dbUser, code))) return { error: "Invalid code." };

  const codes = newBackupCodes(10);
  await prisma.user.update({ where: { id: u.id }, data: { totpBackupCodes: hashBackupCodes(codes) } });
  return { backupCodes: codes };
}

/** Turn off 2FA (requires a current code or backup code). */
export async function disableTotp(formData: FormData) {
  const u = await requireUser();
  if (!rateLimit(`totp-disable:${await clientIp()}`, 15, 15 * 60_000).ok) {
    back({ error: "Too many attempts — wait a few minutes." });
  }
  const code = String(formData.get("code") ?? "").trim();
  const dbUser = await prisma.user.findUnique({
    where: { id: u.id },
    select: { id: true, totpEnabled: true, totpSecret: true, totpBackupCodes: true },
  });
  if (!dbUser?.totpEnabled) back();
  if (!(await verifyAndConsumeSecondFactor(dbUser!, code))) back({ error: "Invalid code — 2FA not changed." });

  await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null, totpBackupCodes: null } });
  back({ ok: "Two-factor authentication turned off." });
}
