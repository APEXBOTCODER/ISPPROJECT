import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";

export const metadata = { title: "Log in" };

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").toLowerCase();
  const ip = await clientIp();

  // Throttle brute force. The per-ACCOUNT cap is keyed on the email ALONE so it
  // can't be sidestepped by rotating (spoofable) source IPs; the per-IP cap is a
  // secondary backstop against spraying many accounts from one host.
  const perAccount = rateLimit(`login:acct:${email}`, 5, 15 * 60_000);
  const perIp = rateLimit(`login:ip:${ip}`, 30, 15 * 60_000);
  if (!perAccount.ok || !perIp.ok) {
    const mins = Math.ceil(Math.max(perAccount.retryAfterSec, perIp.retryAfterSec) / 60);
    redirect(`/login?rate=${mins}`);
  }

  try {
    await signIn("credentials", {
      email,
      password: String(formData.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error;
  }
}

async function googleAction() {
  "use server";
  await signIn("google", { redirectTo: "/dashboard" });
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; timeout?: string; rate?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { error, timeout, rate } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="display text-4xl text-navy">Log in</h1>
      <p className="mt-2 text-sm text-navy/70">
        Book fields, manage reservations, and view your receipts.
      </p>

      {rate && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          Too many login attempts. Please wait about {rate} minute{rate === "1" ? "" : "s"} and try again.
        </p>
      )}
      {timeout && !error && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          You were signed out after 30 minutes of inactivity. Please log in again.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          Invalid email or password. Please try again.
        </p>
      )}

      <form action={loginAction} className="mt-6 space-y-4">
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
        <div>
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
          />
        </div>
        <button type="submit" className="btn-brand w-full rounded-md px-4 py-2.5 uppercase tracking-wide">
          Log in
        </button>
      </form>

      {config.googleAuthEnabled && (
        <form action={googleAction} className="mt-3">
          <button
            type="submit"
            className="w-full rounded-md border border-navy/20 px-4 py-2.5 text-sm font-semibold hover:bg-navy/5"
          >
            Continue with Google
          </button>
        </form>
      )}

      <p className="mt-6 text-sm text-navy/70">
        New to the park?{" "}
        <Link href="/signup" className="font-semibold text-sky hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
