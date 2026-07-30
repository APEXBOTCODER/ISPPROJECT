"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, googleAction } from "@/app/login/actions";

export default function LoginForm({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const [state, action, pending] = useActionState(loginAction, {} as { error?: string; need2fa?: boolean });
  const need2fa = state.need2fa;
  // Controlled so values survive React 19's form reset between the password and
  // 2FA-code steps.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");

  const inputCls =
    "mt-1 w-full rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30";

  return (
    <>
      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />

        <div>
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" readOnly={need2fa}
            value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium">Password</label>
            <Link href="/forgot-password" className="text-xs font-semibold text-sky hover:underline">
              Forgot password?
            </Link>
          </div>
          <input id="password" name="password" type="password" required autoComplete="current-password" readOnly={need2fa}
            value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </div>

        {need2fa && (
          <div>
            <label htmlFor="totp" className="block text-sm font-medium">Authenticator code</label>
            <input
              id="totp"
              name="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              placeholder="123456"
              className={`${inputCls} text-center text-xl tracking-[0.3em]`}
            />
            <p className="mt-1 text-xs text-navy/50">
              Enter the 6-digit code from your authenticator app, or a backup code.
            </p>
          </div>
        )}

        {state.error && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-brand w-full rounded-md px-4 py-2.5 uppercase tracking-wide disabled:opacity-60"
        >
          {pending ? "…" : need2fa ? "Verify & log in" : "Log in"}
        </button>
      </form>

      {googleEnabled && !need2fa && (
        <form action={googleAction} className="mt-3">
          <button type="submit" className="w-full rounded-md border border-navy/20 px-4 py-2.5 text-sm font-semibold hover:bg-navy/5">
            Continue with Google
          </button>
        </form>
      )}
    </>
  );
}
