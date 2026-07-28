import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";
import { findValidResetToken } from "@/lib/passwordReset";

export const metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

const pwSchema = z.string().min(10, "Password must be at least 10 characters").max(128);

function fail(token: string, message: string): never {
  redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(message)}`);
}

async function resetPassword(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const ip = await clientIp();
  if (!rateLimit(`pwreset:ip:${ip}`, 15, 15 * 60_000).ok) {
    fail(token, "Too many attempts — please wait a few minutes and try again.");
  }

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const parsed = pwSchema.safeParse(password);
  if (!parsed.success) fail(token, parsed.error.issues[0].message);
  if (password !== confirm) fail(token, "Passwords don't match.");

  // Re-validate the token at submit time (authoritative) — it may have expired
  // or been used since the page loaded.
  const valid = await findValidResetToken(token);
  if (!valid) {
    redirect(`/reset-password?error=${encodeURIComponent("This reset link is invalid or has expired. Request a new one.")}`);
  }

  const passwordHash = await bcrypt.hash(parsed.data, 12);
  await prisma.$transaction([
    // Set the new password and stamp passwordChangedAt → invalidates other sessions.
    prisma.user.update({
      where: { id: valid.userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    }),
    // Burn every reset token for this user (single-use).
    prisma.passwordResetToken.deleteMany({ where: { userId: valid.userId } }),
  ]);

  redirect("/login?reset=1");
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const valid = token ? await findValidResetToken(token) : null;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="display text-4xl text-navy">Choose a new password</h1>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {!valid ? (
        <div className="mt-6 rounded-md bg-amber-50 px-4 py-4 text-sm text-amber-900 ring-1 ring-amber-200">
          This reset link is invalid or has expired.{" "}
          <Link href="/forgot-password" className="font-semibold text-sky hover:underline">Request a new one</Link>.
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-navy/70">Signed in as {valid.user.name}. Pick a new password below.</p>
          <form action={resetPassword} className="mt-6 space-y-4">
            <input type="hidden" name="token" value={token} />
            <div>
              <label htmlFor="password" className="block text-sm font-medium">New password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
              />
              <p className="mt-1 text-xs text-navy/50">At least 10 characters.</p>
            </div>
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium">Confirm new password</label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
              />
            </div>
            <button type="submit" className="btn-brand w-full rounded-md px-4 py-2.5 uppercase tracking-wide">
              Set new password
            </button>
          </form>
        </>
      )}
    </div>
  );
}
