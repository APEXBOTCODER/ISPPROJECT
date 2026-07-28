"use client";

import { useMemo, useState } from "react";

interface ResourceOpt {
  id: string;
  name: string;
  openHour: number;
  closeHour: number;
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function RescheduleForm({
  action,
  booking,
  resources,
  minDate,
  maxDate,
}: {
  action: (formData: FormData) => Promise<void>;
  booking: { id: string; resourceId: string; date: string; startHour: number; endHour: number; outstandingCents: number };
  resources: ResourceOpt[];
  minDate: string;
  maxDate: string;
}) {
  const [resourceId, setResourceId] = useState(booking.resourceId);
  const [date, setDate] = useState(booking.date);
  const [startHour, setStartHour] = useState(booking.startHour);
  const [endHour, setEndHour] = useState(booking.endHour);

  const resource = useMemo(() => resources.find((r) => r.id === resourceId) ?? resources[0], [resources, resourceId]);
  const oldDuration = booking.endHour - booking.startHour;

  const startOptions = useMemo(() => {
    if (!resource) return [] as number[];
    return Array.from({ length: resource.closeHour - resource.openHour }, (_, i) => resource.openHour + i);
  }, [resource]);
  const endOptions = useMemo(() => {
    if (!resource) return [] as number[];
    return Array.from({ length: resource.closeHour - startHour }, (_, i) => startHour + 1 + i).filter((h) => h <= resource.closeHour);
  }, [resource, startHour]);

  function onResource(id: string) {
    setResourceId(id);
    const r = resources.find((x) => x.id === id);
    if (r) {
      setStartHour((s) => Math.min(Math.max(s, r.openHour), r.closeHour - 1));
      setEndHour((e) => Math.min(Math.max(e, Math.max(r.openHour, startHour) + 1), r.closeHour));
    }
  }
  function onStart(h: number) {
    setStartHour(h);
    setEndHour((e) => (e <= h ? h + 1 : e));
  }

  const newDuration = Math.max(0, endHour - startHour);
  // Keep the booking's existing per-hour rate (outstanding ÷ current hours), so
  // reducing/extending is priced at the customer's original rate. A same-length
  // move leaves the price unchanged.
  const perHour = oldDuration > 0 ? booking.outstandingCents / oldDuration : 0;
  const newPrice = Math.round(perHour * newDuration);
  const refund = Math.max(0, booking.outstandingCents - newPrice);
  const additional = Math.max(0, newPrice - booking.outstandingCents);

  const groundChanged = resourceId !== booking.resourceId;

  return (
    <form action={action} className="mt-5 space-y-4 rounded-2xl border border-navy/10 p-5">
      <input type="hidden" name="bookingId" value={booking.id} />
      <p className="text-xs text-navy/60">
        Move this booking to a different ground and/or change its date and hours. Shortening the hours
        recomputes the price and refunds the difference; a same-length move keeps the price. Only free
        slots within the ground&apos;s window can be chosen.
      </p>

      <label className="block text-sm font-medium text-navy">
        Ground
        <select name="resourceId" value={resourceId} onChange={(e) => onResource(e.target.value)} className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm">
          {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {groundChanged && <span className="mt-1 block text-xs text-sky">Moving to a different ground.</span>}
      </label>

      <label className="block text-sm font-medium text-navy">
        Date
        <input type="date" name="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-navy">
          Start hour
          <select name="startHour" value={startHour} onChange={(e) => onStart(Number(e.target.value))} className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm">
            {startOptions.map((h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-navy">
          End hour
          <select name="endHour" value={endHour} onChange={(e) => setEndHour(Number(e.target.value))} className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm">
            {endOptions.map((h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
        </label>
      </div>

      {/* Live summary */}
      <div className="rounded-lg bg-navy/[0.03] p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-navy/60">New duration</span>
          <span className="font-semibold text-navy">{newDuration}h ({startHour}:00–{endHour}:00)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-navy/60">New price (same rate)</span>
          <span className="font-semibold text-navy">{money(newPrice)}</span>
        </div>
        {refund > 0 && (
          <div className="flex justify-between text-green-700">
            <span>Refund to customer</span>
            <span className="font-bold">{money(refund)}</span>
          </div>
        )}
        {additional > 0 && (
          <div className="flex justify-between text-amber-700">
            <span>Additional due (collect via Zelle)</span>
            <span className="font-bold">{money(additional)}</span>
          </div>
        )}
        {refund === 0 && additional === 0 && <div className="text-xs text-navy/50">Price unchanged.</div>}
      </div>

      <button disabled={newDuration < 1} className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase disabled:opacity-50">
        {refund > 0 ? "Reschedule & refund" : "Reschedule"}
      </button>
    </form>
  );
}
