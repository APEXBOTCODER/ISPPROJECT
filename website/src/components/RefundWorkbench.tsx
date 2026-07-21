"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface WorkbenchSegment {
  id: string;
  resourceName: string;
  date: string;
  startHour: number;
  endHour: number;
  status: string;
  totalCents: number;
  refundedCents: number;
  noShow?: boolean;
  paid?: boolean; // money was collected (has a payment ref)
  policyRefundCents?: number; // suggested refund per the cancellation policy right now
}

export interface WorkbenchReservation {
  id: string;
  label: string | null;
  userName: string;
  userEmail: string;
  status: string;
  totalCents: number;
  refundedCents: number;
  segments: WorkbenchSegment[];
}

export type WorkbenchStandalone = WorkbenchSegment & { userName?: string };

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const badge: Record<string, string> = {
  CONFIRMED: "bg-green-50 text-green-700 ring-green-200",
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  CANCELLED: "bg-navy/5 text-navy/50 ring-navy/10",
};

function outstanding(s: WorkbenchSegment) {
  return Math.max(0, s.totalCents - s.refundedCents);
}

/** Refundable if money was collected and something is still outstanding —
 *  whether it's still CONFIRMED or already CANCELLED (an admin can issue a
 *  goodwill/policy refund even after a customer's inside-24h self-cancel). */
function canRefund(s: WorkbenchSegment) {
  return (s.paid ?? true) && outstanding(s) > 0 && (s.status === "CONFIRMED" || s.status === "CANCELLED");
}

export default function RefundWorkbench({
  reservations,
  standalone,
  action,
  returnTo,
  noShowAction,
}: {
  reservations: WorkbenchReservation[];
  standalone: WorkbenchStandalone[];
  action: (formData: FormData) => Promise<void>;
  returnTo: string;
  /** When provided, each confirmed segment shows Reschedule + No-show controls. */
  noShowAction?: (formData: FormData) => Promise<void>;
}) {
  // Flatten every refundable segment for lookup.
  const segById = useMemo(() => {
    const m = new Map<string, WorkbenchSegment>();
    for (const r of reservations) for (const s of r.segments) m.set(s.id, s);
    for (const s of standalone) m.set(s.id, s);
    return m;
  }, [reservations, standalone]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancel, setCancel] = useState(true);
  const [amountDollars, setAmountDollars] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleReservation(r: WorkbenchReservation) {
    const ids = r.segments.filter(canRefund).map((s) => s.id);
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  const selectedIds = [...selected];
  const selectedTotal = selectedIds.reduce(
    (sum, id) => sum + (segById.get(id) ? outstanding(segById.get(id)!) : 0),
    0
  );
  const single = selectedIds.length === 1 ? segById.get(selectedIds[0]) : null;

  function openFor(ids: string[]) {
    setSelected(new Set(ids));
    setAmountDollars(""); // default = full
    setOpen(true);
  }

  const amountCents =
    single && amountDollars.trim() !== ""
      ? Math.round(parseFloat(amountDollars) * 100)
      : null;
  const amountInvalid =
    single != null &&
    amountDollars.trim() !== "" &&
    (isNaN(Number(amountDollars)) ||
      amountCents! < 0 ||
      amountCents! > outstanding(single));

  const canConfirm =
    reason.trim().length > 0 && selectedIds.length > 0 && !amountInvalid && !submitting;

  function SegmentRow({ s, owner }: { s: WorkbenchSegment; owner?: string }) {
    const disabled = !canRefund(s);
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected.has(s.id)}
            disabled={disabled}
            onChange={() => toggle(s.id)}
            className="h-4 w-4 rounded border-navy/30 disabled:opacity-30"
          />
          <span className="text-navy/80">
            <strong className="text-navy">{s.resourceName}</strong> · {s.date} ·{" "}
            {s.startHour}:00–{s.endHour}:00 · {money(s.totalCents)}
            {s.refundedCents > 0 && (
              <span className="text-navy/50"> · refunded {money(s.refundedCents)}</span>
            )}
            {owner && <span className="block text-xs text-navy/50">{owner}</span>}
          </span>
        </label>
        <span className="flex flex-wrap items-center gap-2">
          {s.noShow && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
              No-show
            </span>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${badge[s.status] ?? badge.CANCELLED}`}>
            {s.status}
          </span>
          {noShowAction && s.status === "CONFIRMED" && (
            <>
              <Link
                href={`/admin/bookings/${s.id}/reschedule`}
                className="rounded-md border border-navy/20 px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy/5"
              >
                Reschedule
              </Link>
              <form action={noShowAction}>
                <input type="hidden" name="bookingId" value={s.id} />
                <input type="hidden" name="noShow" value={s.noShow ? "false" : "true"} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="rounded-md border border-navy/20 px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy/5">
                  {s.noShow ? "Clear no-show" : "No-show"}
                </button>
              </form>
            </>
          )}
          {canRefund(s) && (
            <button
              type="button"
              onClick={() => openFor([s.id])}
              className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Refund
            </button>
          )}
        </span>
      </li>
    );
  }

  return (
    <div className="pb-24">
      {reservations.length === 0 && standalone.length === 0 && (
        <p className="text-sm text-navy/60">No bookings to show.</p>
      )}

      {/* Reservations */}
      <div className="space-y-4">
        {reservations.map((r) => {
          const active = r.segments.filter(canRefund);
          const allOn = active.length > 0 && active.every((s) => selected.has(s.id));
          return (
            <div key={r.id} className="rounded-2xl border border-navy/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex items-start gap-2">
                  {active.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={() => toggleReservation(r)}
                      className="mt-1 h-4 w-4 rounded border-navy/30"
                      aria-label="Select all segments"
                    />
                  )}
                  <span>
                    <span className="display block text-xl text-navy">
                      {r.label || "Reservation"}
                      {r.segments.length > 1 && (
                        <span className="ml-2 text-sm font-normal text-navy/50">
                          {r.segments.length} sessions
                        </span>
                      )}
                    </span>
                    <span className="block text-sm text-navy/60">
                      {r.userName} · {r.userEmail}
                    </span>
                    <span className="block text-xs text-navy/50">
                      Total {money(r.totalCents)}
                      {r.refundedCents > 0 && ` · refunded ${money(r.refundedCents)}`}
                    </span>
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${badge[r.status] ?? badge.CANCELLED}`}>
                    {r.status}
                  </span>
                  {active.length > 0 && (
                    <button
                      type="button"
                      onClick={() => openFor(active.map((s) => s.id))}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Refund reservation
                    </button>
                  )}
                </div>
              </div>
              <ul className="mt-3 divide-y divide-navy/5">
                {r.segments.map((s) => (
                  <SegmentRow key={s.id} s={s} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Standalone bookings */}
      {standalone.length > 0 && (
        <div className="mt-8">
          <h3 className="display text-lg text-navy">Individual bookings</h3>
          <ul className="mt-2 divide-y divide-navy/5 rounded-2xl border border-navy/10 px-4 py-2">
            {standalone.map((s) => (
              <SegmentRow key={s.id} s={s} owner={s.userName} />
            ))}
          </ul>
        </div>
      )}

      {/* Sticky action bar */}
      {selectedIds.length > 0 && !open && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-navy/10 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-navy">
              <strong>{selectedIds.length}</strong> selected · outstanding{" "}
              <strong>{money(selectedTotal)}</strong>
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-md border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => { setAmountDollars(""); setOpen(true); }}
                className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase"
              >
                Review &amp; refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="display text-2xl text-navy">Confirm refund</h3>
            <p className="mt-1 text-sm text-navy/60">
              {selectedIds.length} item(s) · outstanding {money(selectedTotal)}
            </p>

            <ul className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-navy/[0.03] p-3 text-xs text-navy/70">
              {selectedIds.map((id) => {
                const s = segById.get(id);
                if (!s) return null;
                return (
                  <li key={id}>
                    {s.resourceName} · {s.date} · {s.startHour}:00–{s.endHour}:00 ·{" "}
                    {money(outstanding(s))}
                  </li>
                );
              })}
            </ul>

            <form
              action={action}
              onSubmit={() => setSubmitting(true)}
              className="mt-4 space-y-3"
            >
              <input type="hidden" name="bookingIds" value={JSON.stringify(selectedIds)} />
              <input type="hidden" name="returnTo" value={returnTo} />

              {single ? (
                <div>
                  <label className="block text-sm font-medium text-navy">
                    Refund amount (max {money(outstanding(single))})
                    <input
                      name="customAmount"
                      type="number"
                      step="0.01"
                      min={0}
                      max={(outstanding(single) / 100).toFixed(2)}
                      value={amountDollars}
                      onChange={(e) => setAmountDollars(e.target.value)}
                      placeholder={(outstanding(single) / 100).toFixed(2)}
                      className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
                    />
                    <span className="mt-1 block text-xs text-navy/50">
                      Leave blank to refund the full outstanding amount.
                    </span>
                    {amountInvalid && (
                      <span className="mt-1 block text-xs text-red-600">
                        Enter an amount between $0 and {money(outstanding(single))}.
                      </span>
                    )}
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-navy/50">Quick fill:</span>
                    <button type="button" onClick={() => setAmountDollars((outstanding(single) / 100).toFixed(2))}
                      className="rounded border border-navy/20 px-2 py-0.5 font-semibold text-navy hover:bg-navy/5">
                      Full {money(outstanding(single))}
                    </button>
                    {typeof single.policyRefundCents === "number" && (
                      <button type="button" onClick={() => setAmountDollars((single.policyRefundCents! / 100).toFixed(2))}
                        className="rounded border border-sky/40 bg-sky/5 px-2 py-0.5 font-semibold text-navy hover:bg-sky/10">
                        Policy {money(single.policyRefundCents)}
                      </button>
                    )}
                    <button type="button" onClick={() => setAmountDollars("0")}
                      className="rounded border border-navy/20 px-2 py-0.5 font-semibold text-navy hover:bg-navy/5">
                      $0
                    </button>
                  </div>
                </div>
              ) : (
                <p className="rounded-md bg-sky/5 px-3 py-2 text-xs text-navy/70 ring-1 ring-sky/15">
                  Each selected item is refunded its full outstanding amount ·
                  total {money(selectedTotal)}.
                </p>
              )}

              <label className="flex items-start gap-2 text-sm text-navy">
                <input
                  type="checkbox"
                  name="cancel"
                  checked={cancel}
                  onChange={(e) => setCancel(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-navy/30"
                />
                <span>
                  Also cancel the booking(s) &amp; free the slot(s)
                  <span className="block text-xs text-navy/50">
                    Uncheck to refund money while keeping the booking. (Amount $0 +
                    cancel = cancel with no refund.)
                  </span>
                </span>
              </label>

              <label className="block text-sm font-medium text-navy">
                Reason (required — internal, not emailed to the customer)
                <textarea
                  name="reason"
                  required
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Rainout, staff goodwill, duplicate booking…"
                  className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
                />
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setSubmitting(false); }}
                  className="rounded-md border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canConfirm}
                  className="rounded-md bg-red-600 px-5 py-2 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Refunding…" : "Confirm refund"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
