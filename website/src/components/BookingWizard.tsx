"use client";

import { useEffect, useMemo, useState } from "react";
import MultiDayCalendar from "@/components/MultiDayCalendar";
import { fetchDayAvailability, hourBounds } from "@/lib/dayAvailability";

interface ResourceOption {
  id: string;
  slug: string;
  name: string;
  sport: string;
  description: string;
  openHour: number;
  closeHour: number;
  baseRate: number;
  peakRate: number;
}

interface Segment {
  resourceId: string;
  resourceName: string;
  date: string;
  hours: number[];
  subtotal: number;
}

const sportLabels: Record<string, string> = {
  CRICKET: "Cricket",
  SOCCER: "Soccer",
  NETS: "Practice Nets",
  TRAINING: "Training",
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
function fmtHour(h: number) {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? "am" : "pm"}`;
}

export default function BookingWizard({
  resources,
  createReservation,
  maxAdvanceDays,
  maxHoursPerSegment,
  maxSegmentsPerReservation,
  isMockPayments,
}: {
  resources: ResourceOption[];
  createReservation: (formData: FormData) => Promise<void>;
  maxAdvanceDays: number;
  maxHoursPerSegment: number;
  maxSegmentsPerReservation: number;
  isMockPayments: boolean;
}) {
  const sports = useMemo(() => Array.from(new Set(resources.map((r) => r.sport))), [resources]);
  const [sport, setSport] = useState(sports[0] ?? "CRICKET");
  const sportResources = useMemo(() => resources.filter((r) => r.sport === sport), [resources, sport]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedResources = useMemo(
    () => resources.filter((r) => selectedIds.has(r.id)),
    [resources, selectedIds]
  );

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

  // Clamp the hour range into the selected facilities' overlapping window.
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
    if (!bounds) { setNotice("The selected grounds have no common open hours."); return; }
    if (toHour <= fromHour) { setNotice("Choose a valid hour range."); return; }
    if (toHour - fromHour > maxHoursPerSegment) { setNotice(`Max ${maxHoursPerSegment} hours per day.`); return; }

    const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
    const combos = selectedResources.flatMap((r) => days.map((date) => ({ r, date })));
    if (segments.length + combos.length > maxSegmentsPerReservation) {
      setNotice(`That would exceed ${maxSegmentsPerReservation} sessions per reservation. Reduce grounds or days.`);
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
        skipped.length
          ? `Added ${toAdd.length}. Unavailable for ${fmtHour(fromHour)}–${fmtHour(toHour)}: ${skipped.join("; ")}.`
          : toAdd.length ? `Added ${toAdd.length} session(s).` : "Those grounds/days aren't available for that time."
      );
    } finally {
      setAdding(false);
    }
  }

  const submitSegments = useMemo(
    () => segments.map((s) => ({ resourceId: s.resourceId, date: s.date, hours: s.hours })),
    [segments]
  );
  const grandTotal = segments.reduce((sum, s) => sum + s.subtotal, 0);
  const hourOptions = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {/* Step 1: sport */}
        <section>
          <h2 className="display text-xl text-navy">1 · Choose your sport</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {sports.map((s) => (
              <button key={s} type="button" onClick={() => setSport(s)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${sport === s ? "gradient-brand text-white" : "bg-navy/5 text-navy hover:bg-navy/10"}`}>
                {sportLabels[s] ?? s}
              </button>
            ))}
          </div>
        </section>

        {/* Step 2: facilities (multi-select) */}
        <section>
          <h2 className="display text-xl text-navy">2 · Pick grounds <span className="text-sm font-normal text-navy/50">(select one or more)</span></h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {sportResources.map((r) => {
              const on = selectedIds.has(r.id);
              return (
                <button key={r.id} type="button" onClick={() => toggleFacility(r.id)}
                  className={`card-lift relative rounded-xl border p-4 text-left ${on ? "border-pitch ring-2 ring-pitch/40" : "border-navy/15"}`}>
                  <span className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full text-xs ${on ? "gradient-brand text-white" : "border border-navy/20 text-transparent"}`}>✓</span>
                  <div className="pr-6 font-bold text-navy">{r.name}</div>
                  <p className="mt-1 text-xs text-navy/60 line-clamp-2">{r.description}</p>
                  <p className="mt-2 text-sm font-semibold text-pitch-deep">From {money(r.baseRate)}/hr</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 3: days + hours */}
        <section>
          <h2 className="display text-xl text-navy">3 · Pick days &amp; hours</h2>
          {selectedResources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedResources.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-3 py-1 text-xs font-semibold text-navy">
                  {r.name}
                  <button type="button" onClick={() => toggleFacility(r.id)} className="text-navy/40 hover:text-navy" aria-label={`Remove ${r.name}`}>✕</button>
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-navy/60">
            Click days (or drag a range); pick one time (up to {maxHoursPerSegment} hrs) applied to
            every selected ground &amp; day — availability is checked per ground/day.
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
            <MultiDayCalendar value={days} onChange={setDays} minDate={today} maxDate={maxDate} />
            <div className="space-y-3">
              {selectedResources.length === 0 ? (
                <p className="max-w-xs text-sm text-navy/50">Select one or more grounds above.</p>
              ) : !bounds ? (
                <p className="max-w-xs rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                  The selected grounds have no common open hours — pick grounds with overlapping hours.
                </p>
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
                className="rounded-md border border-pitch bg-pitch/10 px-4 py-2 text-sm font-bold uppercase tracking-wide text-pitch-deep hover:bg-pitch/20 disabled:cursor-not-allowed disabled:opacity-40">
                {adding ? "Checking…" : `➕ Add ${selectedResources.length && days.length ? selectedResources.length * days.length : ""} session${selectedResources.length * days.length === 1 ? "" : "s"}`}
              </button>
              {notice && <p className="max-w-xs rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">{notice}</p>}
            </div>
          </div>
        </section>
      </div>

      {/* Summary / checkout */}
      <aside className="h-fit rounded-2xl bg-navy p-6 text-white lg:sticky lg:top-20">
        <h2 className="display text-2xl">Your reservation</h2>
        {segments.length === 0 ? (
          <p className="mt-4 text-sm text-white/60">Select grounds, days, and an hour range, then add them.</p>
        ) : (
          <>
            <ul className="mt-4 space-y-2">
              {segments.map((s, i) => (
                <li key={`${s.resourceId}-${s.date}`} className="rounded-lg bg-white/5 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{s.resourceName}</div>
                      <div className="text-white/60">{s.date} · {fmtHour(s.hours[0])}–{fmtHour(s.hours[s.hours.length - 1] + 1)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-semibold text-pitch">{money(s.subtotal)}</span>
                      <button type="button" onClick={() => setSegments((p) => p.filter((_, x) => x !== i))} className="text-xs text-white/50 hover:text-white">✕ remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-white/15 pt-3 text-base">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-pitch">{money(grandTotal)}</span>
            </div>
            <form action={createReservation} onSubmit={() => setSubmitting(true)} className="mt-4 space-y-3">
              <label className="block text-xs text-white/70">
                Organization / entity (optional)
                <input name="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Argyle Cricket Club"
                  className="mt-1 w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-pitch focus:outline-none" />
              </label>
              <input type="hidden" name="segments" value={JSON.stringify(submitSegments)} />
              <button type="submit" disabled={submitting || submitSegments.length === 0}
                className="btn-brand w-full rounded-md px-4 py-3 uppercase tracking-wide disabled:opacity-60">
                {submitting ? "Processing…" : `Confirm & Pay ${money(grandTotal)}`}
              </button>
            </form>
            {isMockPayments && (
              <p className="mt-3 rounded-md bg-sky/20 px-3 py-2 text-xs text-white/90">Test mode — payment is simulated, no card is charged.</p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
