import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { resendCodeAction, submitCodeAction, updatePhoneAction } from "./actions";

export const metadata = { title: "Verify your account" };
export const dynamic = "force-dynamic";

const inputCls =
  "mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-center text-2xl tracking-[0.4em] font-mono focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; ok?: string; channel?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { next = "/dashboard", error, ok } = await searchParams;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  // Only the email channel gates this banner — SMS is optional, so running it in
  // "console" mode in production is a valid choice and shouldn't imply dev mode.
  const devHint = config.emailProvider === "console";

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="display text-4xl text-navy">Verify your account</h1>
      <p className="mt-2 text-sm text-navy/70">
        Verifying your contact details keeps your bookings and refunds secure.
      </p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}
      {devHint && (
        <p className="mt-4 rounded-md bg-sky/5 px-4 py-3 text-xs text-navy/60 ring-1 ring-sky/15">
          Codes are being printed to the server log, not emailed. Set
          <code> EMAIL_PROVIDER=ses</code> (with SES out of the sandbox) and restart
          to deliver real emails.
        </p>
      )}

      {/* Email */}
      <section className="mt-6 rounded-2xl border border-navy/10 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="display text-xl text-navy">Email</h2>
          {user.emailVerified ? (
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
              ✓ Verified
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
              Required for booking
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-navy/60">{user.email}</p>

        {!user.emailVerified && (
          <>
            <form action={submitCodeAction} className="mt-4">
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="channel" value="EMAIL" />
              <label htmlFor="email-code" className="block text-sm font-medium">
                Enter the 6-digit code we emailed you
              </label>
              <input
                id="email-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                placeholder="••••••"
                className={inputCls}
              />
              <button className="btn-brand mt-3 w-full rounded-md px-4 py-2.5 text-sm uppercase tracking-wide">
                Verify email
              </button>
            </form>
            <form action={resendCodeAction} className="mt-2 text-center">
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="channel" value="EMAIL" />
              <button className="text-sm font-semibold text-sky hover:underline">
                Resend code
              </button>
            </form>
          </>
        )}
      </section>

      {/* Phone (optional) */}
      <section className="mt-4 rounded-2xl border border-navy/10 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="display text-xl text-navy">Phone</h2>
          {user.phoneVerified ? (
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
              ✓ Verified
            </span>
          ) : (
            <span className="rounded-full bg-navy/5 px-3 py-1 text-xs font-semibold text-navy/60 ring-1 ring-navy/10">
              Optional
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-navy/60">
          {user.phone ?? "No phone number on file."} — used for booking reminders
          once SMS goes live.
        </p>

        {!user.phoneVerified && (
          <>
            <form action={updatePhoneAction} className="mt-4 flex gap-2">
              <input type="hidden" name="next" value={next} />
              <input
                name="phone"
                type="tel"
                defaultValue={user.phone ?? ""}
                placeholder="+1 (555) 123-4567"
                className="w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
                aria-label="Phone number"
              />
              <button className="shrink-0 rounded-md border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5">
                {user.phone ? "Send code" : "Add & send code"}
              </button>
            </form>
            {user.phone && (
              <form action={submitCodeAction} className="mt-3">
                <input type="hidden" name="next" value={next} />
                <input type="hidden" name="channel" value="PHONE" />
                <label htmlFor="phone-code" className="block text-sm font-medium">
                  Enter the 6-digit code we texted you
                </label>
                <input
                  id="phone-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  placeholder="••••••"
                  className={inputCls}
                />
                <button className="btn-brand mt-3 w-full rounded-md px-4 py-2.5 text-sm uppercase tracking-wide">
                  Verify phone
                </button>
              </form>
            )}
          </>
        )}
      </section>

      {user.emailVerified && (
        <a
          href={next}
          className="btn-brand mt-6 block rounded-md px-4 py-2.5 text-center text-sm uppercase tracking-wide"
        >
          Continue
        </a>
      )}
    </div>
  );
}
