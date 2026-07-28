"use client";

import { useMemo, useState } from "react";

interface ResourceOpt {
  id: string;
  name: string;
  openHour: number;
  closeHour: number;
}

export default function RescheduleForm({
  action,
  booking,
  resources,
  minDate,
  maxDate,
}: {
  action: (formData: FormData) => Promise<void>;
  booking: { id: string; resourceId: string; date: string; startHour: number; endHour: number };
  resources: ResourceOpt[];
  minDate: string;
  maxDate: string;
}) {
  const duration = booking.endHour - booking.startHour;
  const [resourceId, setResourceId] = useState(booking.resourceId);
  const [date, setDate] = useState(booking.date);
  const [startHour, setStartHour] = useState(booking.startHour);

  const resource = useMemo(
    () => resources.find((r) => r.id === resourceId) ?? resources[0],
    [resources, resourceId]
  );

  // Valid start hours on the chosen ground (must fit the whole duration).
  const hourOptions = useMemo(() => {
    if (!resource) return [] as number[];
    const opts: number[] = [];
    for (let h = resource.openHour; h + duration <= resource.closeHour; h++) opts.push(h);
    return opts;
  }, [resource, duration]);

  // When the ground changes, keep the start hour valid for the new ground.
  function onResource(id: string) {
    setResourceId(id);
    const r = resources.find((x) => x.id === id);
    if (r) {
      const max = r.closeHour - duration;
      setStartHour((s) => Math.min(Math.max(s, r.openHour), max));
    }
  }

  const groundChanged = resourceId !== booking.resourceId;

  return (
    <form action={action} className="mt-5 space-y-4 rounded-2xl border border-navy/10 p-5">
      <input type="hidden" name="bookingId" value={booking.id} />
      <p className="text-xs text-navy/60">
        Moves this {duration}-hour session to a new ground and/or date/time, keeping the same price.
        Only a free slot within that ground&apos;s window can be chosen.
      </p>

      <label className="block text-sm font-medium text-navy">
        Ground
        <select
          name="resourceId"
          value={resourceId}
          onChange={(e) => onResource(e.target.value)}
          className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm"
        >
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {groundChanged && <span className="mt-1 block text-xs text-sky">Moving to a different ground.</span>}
      </label>

      <label className="block text-sm font-medium text-navy">
        New date
        <input
          type="date"
          name="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-sm font-medium text-navy">
        New start hour
        <select
          name="startHour"
          value={startHour}
          onChange={(e) => setStartHour(Number(e.target.value))}
          className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm"
        >
          {hourOptions.map((h) => (
            <option key={h} value={h}>
              {h}:00 – {h + duration}:00
            </option>
          ))}
        </select>
      </label>

      <button className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase">Reschedule</button>
    </form>
  );
}
