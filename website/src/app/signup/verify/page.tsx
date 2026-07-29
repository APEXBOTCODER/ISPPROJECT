import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";
import { verifyPendingSignup } from "@/lib/pendingSignup";

export const metadata = { title: "Verify your email" };
export const dynamic = "force-dynamic";

const codeSchema = z.string().regex(/^\d{6}$/);

function back(email: string, error: string): never {
  redirect(`/signup/verify?email=${encodeURIComponent(email)}&error=${encodeURIComponent(error)}`);
}

async function verifyAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const ip = await clientIp();
  if (!rateLimit(`signup-verify:${ip}`, 15, 60 * 60_000).ok) {
    back(email, "Too many attempts — please wait a little while.");
  }

  const parsed = codeSchema.safeParse(String(formData.get("code") ?? "").trim());
  if (!parsed.success) back(email, "Enter the 6-digit code.");

  const result = await verifyPendingSignup(email, parsed.data);
  if (!result.ok) back(email, result.error);
  const d = result.data;

  // Only now is the account created (email is proven). Upsert also claims any
  // legacy unverified row for this email.
  const verified = { name: d.name, phone: d.phone, passwordHash: d.passwordHash, emailVerified: new Date() };
  await prisma.user.upsert({
    where: { email: d.email },
    create: { email: d.email, ...verified },
    update: verified,
  });
  await prisma.pendingSignup.delete({ where: { email } }).catch(() => {});

  redirect("/login?verified=1");
}

export default async function SignupVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const { email = "", error } = await searchParams;

  if (!email) redirect("/signup");

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="display text-4xl text-navy">Verify your email</h1>
      <p className="mt-2 text-sm text-navy/70">
        We emailed a 6-digit code to <strong>{email}</strong>. Enter it to finish creating your account.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      <form action={verifyAction} className="mt-6 space-y-4">
        <input type="hidden" name="email" value={email} />
        <div>
          <label htmlFor="code" className="block text-sm font-medium">Verification code</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
            className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-center text-2xl tracking-[0.4em] font-mono focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
          />
        </div>
        <button type="submit" className="btn-brand w-full rounded-md px-4 py-2.5 uppercase tracking-wide">
          Create my account
        </button>
      </form>

      <p className="mt-6 text-sm text-navy/70">
        Didn&apos;t get it? Check spam, or{" "}
        <Link href="/signup" className="font-semibold text-sky hover:underline">start over</Link>.
        The code expires in 30 minutes.
      </p>
    </div>
  );
}
