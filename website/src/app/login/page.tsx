import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { safeNext } from "@/lib/safeNext";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Log in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; timeout?: string; rate?: string; reset?: string; verified?: string; next?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { error, timeout, rate, reset, verified, next } = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="display text-4xl text-navy">Log in</h1>
      <p className="mt-2 text-sm text-navy/70">
        Book fields, manage reservations, and view your receipts.
      </p>

      {verified && !error && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">
          Your email is verified and your account is created. Log in to continue.
        </p>
      )}
      {reset && !error && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">
          Your password has been reset. Log in with your new password.
        </p>
      )}
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
          Sign-in failed. Please try again.
        </p>
      )}

      <LoginForm next={safeNext(next)} googleEnabled={config.googleAuthEnabled} />

      <p className="mt-6 text-sm text-navy/70">
        New to the park?{" "}
        <Link href="/signup" className="font-semibold text-sky hover:underline">Create an account</Link>
      </p>
    </div>
  );
}
