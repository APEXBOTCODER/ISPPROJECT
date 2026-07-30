"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";
import { safeNext } from "@/lib/safeNext";

export type LoginState = { error?: string; need2fa?: boolean };

/**
 * Credential login with optional 2FA. Returns state for the client form:
 *  - { need2fa: true } once the password is correct and the account has 2FA
 *    (the form then reveals the code field, keeping email+password),
 *  - { error } on a bad password/code,
 *  - and redirects (throws) on success.
 * The auth `authorize()` callback re-checks the code, so 2FA can't be bypassed.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const totp = String(formData.get("totp") ?? "").trim();
  const next = safeNext(formData.get("next"), "/dashboard");
  const ip = await clientIp();

  const perAccount = rateLimit(`login:acct:${email}`, 10, 15 * 60_000);
  const perIp = rateLimit(`login:ip:${ip}`, 40, 15 * 60_000);
  if (!perAccount.ok || !perIp.ok) {
    return { error: "Too many attempts — please wait a few minutes and try again." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }
  // Password is correct. If 2FA is on and no code yet, prompt for one.
  if (user.totpEnabled && !totp) {
    return { need2fa: true };
  }

  try {
    await signIn("credentials", { email, password, totp, redirectTo: next });
  } catch (e) {
    if (e instanceof AuthError) {
      return user.totpEnabled
        ? { need2fa: true, error: "That code was invalid or expired — try again." }
        : { error: "Invalid email or password." };
    }
    throw e; // NEXT_REDIRECT on success — rethrow to navigate
  }
  return {};
}

export async function googleAction() {
  await signIn("google", { redirectTo: "/dashboard" });
}
