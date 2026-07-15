"use client";

import { useEffect, useMemo, useState } from "react";
import UserSearch, { type FoundUser } from "@/components/UserSearch";
import MultiDayCalendar from "@/components/MultiDayCalendar";
import { fetchDayAvailability, hourBounds } from "@/lib/dayAvailability";

interface ResourceOption {
  id: string;
  name: string;
  sport: string;
  openHour: number;
  closeHour: number;
  baseRate: number;
}

interface Segment {
  resourceId: string;
  resourceName: string;
  date: string;
  hours: number[];
  subtotal: number;
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
function fmtHour(h: number) {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? "am" : "pm"}`;
}

export default function AdminBookingForm({
  resources,
  action,
  maxAdvanceDays,
  maxHoursPerSegment,
  maxSegmentsPerReservation,
}: {
  resources: ResourceOption[];
  action: (formData: FormData) => Promise<void>;
  maxAdvanceDays: number;
  maxHoursPerSegment: number;
  maxSegmentsPerReservation: number;
}) {
  const [customer, setCustomer] = useState<FoundUser | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedResources = useMemo(() => resources.filter((r) => selectedIds.has(r.id)), [resources, selectedIds]);

  const today = new Date().toISOString().slice(0, 10);
  const maxD = new Date();
  maxD.setDate(maxD.getDate() + maxAdvanceDays);
  const maxDate = maxD.toISOString().slice(0, 10);

  const [days, setDays] = useState<string[]>([]);
  const [fromHour, setFromHour] = useState(8);
  const [toHour, setToHour] = useState(9);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [label, setLabel] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const bounds = useMemo(() => hourBounds(selectedResources), [selectedResources]);
  useEffect(() => {
    if (!bounds) return;
    setFromHour((f) => Math.min(Math.max(f, bounds.open), bounds.close - 1));
    setToHour((t) => Math.min(Math.max(t, bounds.open + 1), bounds.close));
  }, [bounds]);

  function toggleFacility(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const cartKeys = useMemo(() => new Set(segments.map((s) => `${s.resourceId}:${s.date}`)), [segments]);

  async function addDays() {
    if (selectedResources.length === 0 || days.length === 0) return;
    if (!bounds) { setNotice("Selected grounds have no common open hours."); return; }
    if (toHour <= fromHour) { setNotice("Choose a valid hour range."); return; }
    if (toHour - fromHour > maxHoursPerSegment) { setNotice(`Max ${maxHoursPerSegment} hours per day.`); return; }

    const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
    const combos = selectedResources.flatMap((r) => days.map((date) => ({ r, date })));
    if (segments.length + combos.length > maxSegmentsPerReservation) {
      setNotice(`That would exceed ${maxSegmentsPerReservation} sessions. Reduce grounds or days.`);
      return;
    }
    setAdding(true);
    try {
      const results = await Promise.all(
        combos.map(async ({ r, date }) => {
          if (cartKeys.has(`${r.id}:${date}`)) return { r, date, ok: false, dup: true, subtotal: 0 };
          const slots = await fetchDayAvailability(r.id, date);
          const byHour = new Map(slots.map((s) => [s.hour, s]));
          const ok = hours.every((h) => byHour.get(h)?.status === "free");
          const subtotal = ok ? hours.reduce((sum, h) => sum + (byHour.get(h)?.priceCents ?? 0), 0) : 0;
          return { r, date, ok, dup: false, subtotal };
        })
      );
      const toAdd = results.filter((x) => x.ok);
      const skipped = results.filter((x) => !x.ok && !x.dup).map((x) => `${x.r.name} · ${x.date}`);
      if (toAdd.length > 0) {
        setSegments((prev) => [
          ...prev,
          ...toAdd.map((x) => ({ resourceId: x.r.id, resourceName: x.r.name, date: x.date, hours, subtotal: x.subtotal })),
        ]);
      }
      setDays([]);
      setNotice(
        skipped.length ? `Added ${toAdd.length}. Unavailable: ${skipped.join("; ")}.` : toAdd.length ? `Added ${toAdd.length} session(s).` : "Not available for that time."
      );
    } finally {
      setAdding(false);
    }
  }

  const submitSegments = useMemo(() => segments.map((s) => ({ resourceId: s.resourceId, date: s.date, hours: s.hours })), [segments]);
  const grandTotal = segments.reduce((s, x) => s + x.subtotal, 0);
  const canSubmit = !!customer && submitSegments.length > 0 && !submitting;
  const hourOptions = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <section>
          <h2 className="display text-xl text-navy">1 · Customer</h2>
          {customer ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-md bg-navy/5 px-3 py-2">{customer.name} · {customer.email}</span>
              <button type="button" onClick={() => setCustomer(null)} className="text-xs font-semibold text-sky hover:underline">change</button>
            </div>
          ) : (
            <div className="mt-2 max-w-md"><UserSearch onSelect={setCustomer} placeholder="Search customer by name or email…" /></div>
          )}
        </section>

        <section>
          <h2 className="display text-xl text-navy">2 · Grounds <span className="text-sm font-normal text-navy/50">(select one or more)</span></h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {resources.map((r) => {
              const on = selectedIds.has(r.id);
              return (
                <button key={r.id} type="button" onClick={() => toggleFacility(r.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? "gradient-brand border-transparent text-white" : "border-navy/20 text-navy hover:bg-navy/5"}`}>
                  {on ? "✓ " : ""}{r.name}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="display text-xl text-navy">3 · Days &amp; hours</h2>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <MultiDayCalendar value={days} onChange={setDays} minDate={today} maxDate={maxDate} />
            <div className="space-y-3">
              {selectedResources.length === 0 ? (
                <p className="max-w-xs text-sm text-navy/50">Select one or more grounds above.</p>
              ) : !bounds ? (
                <p className="max-w-xs rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">No common open hours across the selected grounds.</p>
              ) : (
                <div className="flex items-end gap-2">
                  <label className="text-xs font-semibold text-navy/60">From
                    <select value={fromHour} onChange={(e) => setFromHour(Number(e.target.value))} className="mt-1 block rounded-md border border-navy/20 px-2 py-1.5 text-sm">
                      {hourOptions(bounds.open, bounds.close - 1).map((h) => <option key={h} value={h}>{h}:00</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-navy/60">To
                    <select value={toHour} onChange={(e) => setToHour(Number(e.target.value))} className="mt-1 block rounded-md border border-navy/20 px-2 py-1.5 text-sm">
                      {hourOptions(bounds.open + 1, bounds.close).map((h) => <option key={h} value={h}>{h}:00</option>)}
                    </select>
                  </label>
                </div>
              )}
              <button type="button" onClick={addDays} disabled={selectedResources.length === 0 || days.length === 0 || !bounds || adding}
                className="rounded-md border border-pitch bg-pitch/10 px-4 py-2 text-sm font-bold uppercase text-pitch-deep hover:bg-pitch/20 disabled:opacity-40">
                {adding ? "Checking…" : `➕ Add ${selectedResources.length && days.length ? selectedResources.length * days.length : ""} session${selectedResources.length * days.length === 1 ? "" : "s"}`}
              </button>
              {notice && <p className="max-w-xs rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">{notice}</p>}
            </div>
          </div>
        </section>
      </div>

      <aside className="h-fit rounded-2xl bg-navy p-6 text-white lg:sticky lg:top-20">
        <h2 className="display text-2xl">Booking</h2>
        {segments.length === 0 ? (
          <p className="mt-3 text-sm text-white/60">Pick grounds, days and hours, then add.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-2 text-sm">
              {segments.map((s, i) => (
                <li key={`${s.resourceId}-${s.date}`} className="flex justify-between gap-2 rounded-lg bg-white/5 p-2">
                  <span>{s.resourceName}<span className="block text-white/60">{s.date} · {fmtHour(s.hours[0])}–{fmtHour(s.hours[s.hours.length - 1] + 1)}</span></span>
                  <span className="flex flex-col items-end">
                    <span className="font-semibold text-pitch">{money(s.subtotal)}</span>
                    <button type="button" onClick={() => setSegments((p) => p.filter((_, x) => x !== i))} className="text-xs text-white/50 hover:text-white">remove</button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-white/15 pt-2">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-pitch">{money(grandTotal)}</span>
            </div>
            <form action={action} onSubmit={() => setSubmitting(true)} className="mt-4 space-y-2">
              <input type="hidden" name="customerId" value={customer?.id ?? ""} />
              <input type="hidden" name="segments" value={JSON.stringify(submitSegments)} />
              <input name="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Note / organization (optional)"
                className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40" />
              <button type="submit" disabled={!canSubmit} className="btn-brand w-full rounded-md px-4 py-3 text-sm uppercase disabled:opacity-50">
                {submitting ? "Booking…" : `Confirm booking ${money(grandTotal)}`}
              </button>
              {!customer && <p className="text-xs text-amber-200">Select a customer first.</p>}
              <p className="text-xs text-white/60">Comp booking — no payment is charged.</p>
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
