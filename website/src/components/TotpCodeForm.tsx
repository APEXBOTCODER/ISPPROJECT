"use client";

import { useActionState } from "react";
import type { CodeState } from "@/app/account/security/actions";

/** Shared code-entry form for confirming 2FA setup or regenerating backup codes.
 *  On success the action returns one-time backup codes, shown once here. */
export default function TotpCodeForm({
  action,
  submitLabel,
  placeholder = "123456",
}: {
  action: (prev: CodeState, formData: FormData) => Promise<CodeState>;
  submitLabel: string;
  placeholder?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as CodeState);

  if (state.backupCodes) {
    return (
      <div className="rounded-lg border-2 border-pitch/40 bg-pitch/[0.04] p-4">
        <p className="text-sm font-semibold text-navy">Save your backup codes</p>
        <p className="mt-1 text-xs text-navy/60">
          Store these somewhere safe. Each works once if you lose your authenticator. They won&apos;t be
          shown again.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm text-navy">
          {state.backupCodes.map((c) => (
            <li key={c} className="rounded bg-white px-2 py-1 text-center ring-1 ring-navy/10">{c}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-navy/50">Done — reload the page to see your 2FA status.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-navy/60">
        Code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder={placeholder}
          className="mt-1 block w-40 rounded-md border border-navy/20 px-3 py-2 text-center font-mono text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
        />
      </label>
      <button type="submit" disabled={pending} className="btn-brand rounded-md px-4 py-2 text-sm font-bold uppercase disabled:opacity-60">
        {pending ? "…" : submitLabel}
      </button>
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
