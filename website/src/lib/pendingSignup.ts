import { createHash, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

export const SIGNUP_CODE_TTL_MIN = 30;
const MAX_ATTEMPTS = 6;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Create or replace a pending sign-up for an email and return the 6-digit code
 *  (to email). The real User is NOT created here. */
export async function issuePendingSignup(input: {
  email: string;
  name: string;
  phone?: string;
  passwordHash: string;
}): Promise<string> {
  const code = String(randomInt(100000, 1000000));
  const common = {
    name: input.name,
    phone: input.phone ?? null,
    passwordHash: input.passwordHash,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + SIGNUP_CODE_TTL_MIN * 60_000),
    attempts: 0,
  };
  await prisma.pendingSignup.upsert({
    where: { email: input.email },
    create: { email: input.email, ...common },
    update: common,
  });
  return code;
}

export type PendingVerifyResult =
  | { ok: true; data: { email: string; name: string; phone: string | null; passwordHash: string } }
  | { ok: false; error: string };

/** Check a submitted code for a pending sign-up. On success returns the data to
 *  create the account with. Wrong codes increment an attempt counter. */
export async function verifyPendingSignup(email: string, code: string): Promise<PendingVerifyResult> {
  const p = await prisma.pendingSignup.findUnique({ where: { email } });
  if (!p) return { ok: false, error: "No pending sign-up found — please register again." };
  if (p.expiresAt < new Date()) return { ok: false, error: "That code has expired — please register again." };
  if (p.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Too many attempts — please register again." };
  if (hashCode(code.trim()) !== p.codeHash) {
    await prisma.pendingSignup.update({ where: { email }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "Incorrect code — please check and try again." };
  }
  return { ok: true, data: { email: p.email, name: p.name, phone: p.phone, passwordHash: p.passwordHash } };
}
