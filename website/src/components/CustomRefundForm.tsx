"use client";

import { useState } from "react";
import UserSearch from "@/components/UserSearch";

interface BasicUser {
  id: string;
  name: string;
  email: string;
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CustomRefundForm({
  action,
  defaultUser,
  capCents,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultUser?: BasicUser | null;
  capCents?: number;
}) {
  const [user, setUser] = useState<BasicUser | null>(defaultUser ?? null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const amountCents = Math.round(parseFloat(amount) * 100);
  const amountValid = amount.trim() !== "" && !isNaN(amountCents) && amountCents > 0;
  const showCap = !!user && !!defaultUser && user.id === defaultUser.id && capCents != null;
  const overCap = showCap && amountValid ? amountCents > capCents! : false;
  const ready = !!user && amountValid && reason.trim().length >= 3 && !overCap;

  return (
    <form action={action} onSubmit={() => setSubmitting(true)} className="mt-4 space-y-3">
      <div>
        <label className="block text-sm font-medium text-navy">Customer</label>
        {user ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-navy/5 px-3 py-2 text-sm text-navy">
              {user.name} · {user.email}
            </span>
            <button
              type="button"
              onClick={() => { setUser(null); setConfirming(false); }}
              className="text-xs font-semibold text-sky hover:underline"
            >
              change
            </button>
          </div>
        ) : (
          <div className="mt-1">
            <UserSearch onSelect={(u) => { setUser(u); setConfirming(false); }} />
          </div>
        )}
      </div>
      <input type="hidden" name="userId" value={user?.id ?? ""} />

      {showCap && (
        <p className="text-xs text-navy/50">
          Refundable balance for this customer: <strong>{money(capCents!)}</strong>
        </p>
      )}

      <label className="block text-sm font-medium text-navy">
        Amount (USD)
        <input
          name="amount"
          type="number"
          step="0.01"
          min={0}
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setConfirming(false); }}
          placeholder="0.00"
          className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
        />
        {overCap && (
          <span className="mt-1 block text-xs text-red-600">
            Exceeds the refundable balance ({money(capCents!)}).
          </span>
        )}
      </label>

      <label className="block text-sm font-medium text-navy">
        Reason (required — internal)
        <textarea
          name="reason"
          required
          rows={2}
          value={reason}
          onChange={(e) => { setReason(e.target.value); setConfirming(false); }}
          placeholder="e.g. Goodwill credit, partial adjustment…"
          className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
        />
      </label>

      {!confirming ? (
        <button
          type="button"
          disabled={!ready}
          onClick={() => setConfirming(true)}
          className="rounded-md bg-red-600 px-5 py-2 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Review refund
        </button>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-navy">
            Refund <strong>{money(amountCents)}</strong> to <strong>{user?.name}</strong>?
            This does not cancel any booking.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-navy/20 px-4 py-1.5 text-xs font-semibold text-navy hover:bg-navy/5"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-bold uppercase text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Refunding…" : "Confirm refund"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
