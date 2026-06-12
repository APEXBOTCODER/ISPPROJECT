"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

interface Slot {
  hour: number;
  status: "free" | "taken" | "blocked" | "past";
  peak: boolean;
  priceCents: number;
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

function formatHour(hour: number) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${hour < 12 ? "am" : "pm"}`;
}

export default function BookingWizard({
  resources,
  createBooking,
  maxAdvanceDays,
  isMockPayments,
}: {
  resources: ResourceOption[];
  createBooking: (formData: FormData) => Promise<void>;
  maxAdvanceDays: number;
  isMockPayments: boolean;
}) {
  const sports = useMemo(
    () => Array.from(new Set(resources.map((r) => r.sport))),
    [resources]
  );
  const [sport, setSport] = useState(sports[0] ?? "CRICKET");
  const sportResources = useMemo(
    () => resources.filter((r) => r.sport === sport),
    [resources, sport]
  );
  const [resourceId, setResourceId] = useState(sportResources[0]?.id ?? "");
  const resource = resources.find((r) => r.id === resourceId);

  const today = new Date();
  const minDate = today.toISOString().slice(0, 10);
  const max = new Date(today);
  max.setDate(max.getDate() + maxAdvanceDays);
  const maxDate = max.toISOString().slice(0, 10);

  const [date, setDate] = useState(minDate);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Keep resource selection valid when switching sports
  useEffect(() => {
    if (!sportResources.some((r) => r.id === resourceId)) {
      setResourceId(sportResources[0]?.id ?? "");
    }
  }, [sport, sportResources, resourceId]);

  const loadSlots = useCallback(async () => {
    if (!resourceId || !date) return;
    setLoading(true);
    setSelected([]);
    try {
      const res = await fetch(
        `/api/availability?resourceId=${encodeURIComponent(resourceId)}&date=${date}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      setSlots(data.slots ?? []);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [resourceId, date]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  function toggleHour(hour: number) {
    setSelected((prev) => {
      if (prev.includes(hour)) {
        // Allow deselect only from the ends so the block stays contiguous
        const sorted = [...prev].sort((a, b) => a - b);
        if (hour === sorted[0] || hour === sorted[sorted.length - 1]) {
          return prev.filter((h) => h !== hour);
        }
        return prev;
      }
      if (prev.length === 0) return [hour];
      const sorted = [...prev].sort((a, b) => a - b);
      // Only allow extending the contiguous block, up to 6 hours
      if (
        prev.length < 6 &&
        (hour === sorted[0] - 1 || hour === sorted[sorted.length - 1] + 1)
      ) {
        return [...prev, hour];
      }
      return [hour];
    });
  }

  const total = useMemo(() => {
    if (!slots) return 0;
    return selected.reduce((sum, hour) => {
      const slot = slots.find((s) => s.hour === hour);
      return sum + (slot?.priceCents ?? 0);
    }, 0);
  }, [selected, slots]);

  const sortedSelection = [...selected].sort((a, b) => a - b);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Step 1: sport */}
        <section>
          <h2 className="display text-xl text-navy">1 · Choose your sport</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {sports.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSport(s)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  sport === s
                    ? "gradient-brand text-white"
                    : "bg-navy/5 text-navy hover:bg-navy/10"
                }`}
              >
                {sportLabels[s] ?? s}
              </button>
            ))}
          </div>
        </section>

        {/* Step 2: facility */}
        <section>
          <h2 className="display text-xl text-navy">2 · Pick a facility</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {sportResources.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setResourceId(r.id)}
                className={`card-lift rounded-xl border p-4 text-left ${
                  resourceId === r.id
                    ? "border-pitch ring-2 ring-pitch/40"
                    : "border-navy/15"
                }`}
              >
                <div className="font-bold text-navy">{r.name}</div>
                <p className="mt-1 text-xs text-navy/60 line-clamp-2">{r.description}</p>
                <p className="mt-2 text-sm font-semibold text-pitch-deep">
                  From {money(r.baseRate)}/hr
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Step 3: date */}
        <section>
          <h2 className="display text-xl text-navy">3 · Pick a date</h2>
          <input
            type="date"
            value={date}
            min={minDate}
            max={maxDate}
            onChange={(e) => setDate(e.target.value)}
            className="mt-3 rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
            aria-label="Booking date"
          />
        </section>

        {/* Step 4: slots */}
        <section>
          <h2 className="display text-xl text-navy">4 · Choose your hours</h2>
          <p className="mt-1 text-xs text-navy/60">
            All times US Central. Select up to 6 consecutive hours. Peak = weekday evenings &amp; weekends.
          </p>
          {loading ? (
            <p className="mt-4 text-sm text-navy/60">Loading availability…</p>
          ) : slots && slots.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {slots.map((slot) => {
                const isSelected = selected.includes(slot.hour);
                const disabled = slot.status !== "free";
                return (
                  <button
                    key={slot.hour}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleHour(slot.hour)}
                    aria-pressed={isSelected}
                    className={`rounded-lg border px-2 py-2.5 text-center text-sm transition-colors ${
                      isSelected
                        ? "gradient-brand border-transparent font-bold text-white"
                        : disabled
                          ? "cursor-not-allowed border-navy/10 bg-navy/5 text-navy/30 line-through"
                          : "border-navy/15 hover:border-pitch hover:bg-pitch/5"
                    }`}
                  >
                    <div>{formatHour(slot.hour)}</div>
                    <div className={`text-xs ${isSelected ? "text-white/90" : "text-navy/50"}`}>
                      {disabled
                        ? slot.status === "past"
                          ? "—"
                          : "Booked"
                        : `${money(slot.priceCents)}${slot.peak ? " ⚡" : ""}`}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-navy/60">No slots for this date.</p>
          )}
        </section>
      </div>

      {/* Summary / checkout */}
      <aside className="h-fit rounded-2xl bg-navy p-6 text-white lg:sticky lg:top-20">
        <h2 className="display text-2xl">Your booking</h2>
        {resource && sortedSelection.length > 0 ? (
          <>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-white/60">Facility</dt>
                <dd className="text-right font-medium">{resource.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/60">Date</dt>
                <dd className="font-medium">{date}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/60">Time</dt>
                <dd className="font-medium">
                  {formatHour(sortedSelection[0])} – {formatHour(sortedSelection[sortedSelection.length - 1] + 1)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-white/15 pt-2 text-base">
                <dt className="font-semibold">Total</dt>
                <dd className="font-bold text-pitch">{money(total)}</dd>
              </div>
            </dl>
            <form
              action={createBooking}
              onSubmit={() => setSubmitting(true)}
              className="mt-5"
            >
              <input type="hidden" name="resourceId" value={resource.id} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="hours" value={JSON.stringify(sortedSelection)} />
              <button
                type="submit"
                disabled={submitting}
                className="btn-brand w-full rounded-md px-4 py-3 uppercase tracking-wide disabled:opacity-60"
              >
                {submitting ? "Processing…" : "Confirm & Pay"}
              </button>
            </form>
            {isMockPayments && (
              <p className="mt-3 rounded-md bg-sky/20 px-3 py-2 text-xs text-white/90">
                Test mode — payment is simulated, no card is charged. Stripe goes
                live when the owner flips <code>PAYMENTS_PROVIDER=stripe</code>.
              </p>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-white/60">
            Select a facility, date, and at least one hour to see your total.
          </p>
        )}
      </aside>
    </div>
  );
}
