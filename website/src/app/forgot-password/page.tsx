import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";
import { issueResetToken, RESET_TTL_MINUTES } from "@/lib/passwordReset";

export const metadata = { title: "Reset your password" };
export const dynamic = "force-dynamic";

const emailSchema = z.string().email();

async function requestReset(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const ip = await clientIp();

  // Rate-limit to blunt enumeration probing and email-bombing. We ALWAYS finish
  // with the same generic response, so the page never reveals whether an account
  // with this email exists (no user enumeration).
  const perIp = rateLimit(`pwreset-req:ip:${ip}`, 10, 15 * 60_000);
  const perEmail = rateLimit(`pwreset-req:acct:${email}`, 3, 15 * 60_000);

  if (perIp.ok && perEmail.ok && emailSchema.safeParse(email).success) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.active) {
      const raw = await issueResetToken(user.id);
      // Link is built from the configured site URL — never from the request Host
      // header — so a spoofed Host can't poison the reset link.
      const link = `${config.siteUrl}/reset-password?token=${raw}`;
      await sendEmail({
        to: user.email,
        subject: `Reset your ${config.siteName} password`,
        text: [
          `Hi ${user.name},`,
          ``,
          `We received a request to reset your password. Choose a new one here — this link expires in ${RESET_TTL_MINUTES} minutes and can be used once:`,
          ``,
          link,
          ``,
          `If you didn't request this, you can safely ignore this email — your password won't change.`,
          ``,
          `${config.siteName}`,
        ].join("\n"),
      });
    }
  }

  redirect("/forgot-password?sent=1");
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="display text-4xl text-navy">Reset your password</h1>

      {sent ? (
        <div className="mt-6 rounded-md bg-green-50 px-4 py-4 text-sm text-green-800 ring-1 ring-green-200">
          If an account exists for that email, we&apos;ve sent a password-reset link. Check your inbox
          (and spam). The link expires in {RESET_TTL_MINUTES} minutes.
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-navy/70">
            Enter your account email and we&apos;ll send you a link to set a new password.
          </p>
          <form action={requestReset} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
              />
            </div>
            <button type="submit" className="btn-brand w-full rounded-md px-4 py-2.5 uppercase tracking-wide">
              Send reset link
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-sm text-navy/70">
        <Link href="/login" className="font-semibold text-sky hover:underline">← Back to log in</Link>
      </p>
    </div>
  );
}
