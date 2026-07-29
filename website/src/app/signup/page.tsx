import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";
import { issuePendingSignup, SIGNUP_CODE_TTL_MIN } from "@/lib/pendingSignup";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

const signupSchema = z.object({
  name: z.string().min(2, "Please enter your full name").max(100),
  email: z.string().email("Please enter a valid email"),
  phone: z.string().max(20).optional(),
  password: z.string().min(10, "Password must be at least 10 characters").max(128),
});

async function signupAction(formData: FormData) {
  "use server";
  const ip = await clientIp();
  if (!rateLimit(`signup:${ip}`, 10, 60 * 60_000).ok) {
    redirect(`/signup?error=${encodeURIComponent("Too many attempts — please wait a little while.")}`);
  }

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/signup?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const { name, email, phone, password } = parsed.data;

  // A real (verified) account already exists → block. An unverified legacy row
  // does NOT block: verifying will claim/upgrade it.
  const existing = await prisma.user.findUnique({ where: { email }, select: { emailVerified: true } });
  if (existing?.emailVerified) {
    redirect(`/signup?error=${encodeURIComponent("An account with this email already exists")}`);
  }

  // Hold the sign-up as pending and email a code. No account is created yet.
  const passwordHash = await bcrypt.hash(password, 12);
  const code = await issuePendingSignup({ email, name, phone, passwordHash });
  await sendEmail({
    to: email,
    subject: `${code} is your ${config.siteName} verification code`,
    text: [
      `Hi ${name},`,
      ``,
      `Your email verification code is: ${code}`,
      ``,
      `Enter it to finish creating your account. It expires in ${SIGNUP_CODE_TTL_MIN} minutes.`,
      `If you didn't request this, you can ignore this email — no account is created until the code is entered.`,
      ``,
      `${config.siteName}`,
    ].join("\n"),
  });

  redirect(`/signup/verify?email=${encodeURIComponent(email)}`);
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="display text-4xl text-navy">Create your account</h1>
      <p className="mt-2 text-sm text-navy/70">
        One account for bookings, waivers, and receipts. We&apos;ll email you a code to verify your
        address — your account is created once you enter it.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <form action={signupAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">Full name</label>
          <input id="name" name="name" required autoComplete="name"
            className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30" />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email"
            className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30" />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium">
            Phone <span className="text-navy/50">(optional)</span>
          </label>
          <input id="phone" name="phone" type="tel" autoComplete="tel"
            className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
          <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30" />
          <p className="mt-1 text-xs text-navy/50">At least 10 characters.</p>
        </div>
        <button type="submit" className="btn-brand w-full rounded-md px-4 py-2.5 uppercase tracking-wide">
          Send verification code
        </button>
      </form>

      <p className="mt-6 text-sm text-navy/70">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-sky hover:underline">Log in</Link>
      </p>
    </div>
  );
}
