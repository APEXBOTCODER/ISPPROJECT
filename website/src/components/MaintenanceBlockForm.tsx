"use client";

import { useState } from "react";
import MultiDayCalendar from "@/components/MultiDayCalendar";

export default function MaintenanceBlockForm({
  resources,
  action,
  minDate,
  maxDate,
}: {
  resources: { id: string; name: string }[];
  action: (formData: FormData) => Promise<void>;
  minDate: string;
  maxDate: string;
}) {
  const [dates, setDates] = useState<string[]>([]);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[auto_1fr]">
      <div>
        <MultiDayCalendar value={dates} onChange={setDates} minDate={minDate} maxDate={maxDate} />
        <p className="mt-1 text-xs text-navy/50">
          {dates.length === 0 ? "Click / drag to select days to block." : `${dates.length} day(s) selected`}
        </p>
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-semibold text-navy/60">
          Facility
          <select name="resourceId" required className="mt-1 block w-full rounded-md border border-navy/20 px-2 py-2 text-sm">
            {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="text-xs font-semibold text-navy/60">
            From hour
            <select name="startHour" required defaultValue={8} className="mt-1 block rounded-md border border-navy/20 px-2 py-2 text-sm">
              {Array.from({ length: 17 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-navy/60">
            To hour
            <select name="endHour" required defaultValue={12} className="mt-1 block rounded-md border border-navy/20 px-2 py-2 text-sm">
              {Array.from({ length: 18 }, (_, i) => i + 7).map((h) => <option key={h} value={h}>{h}:00</option>)}
            </select>
          </label>
        </div>
        <input name="reason" placeholder="Reason (e.g., pitch maintenance)"
          className="block w-full rounded-md border border-navy/20 px-3 py-2 text-sm" />
        <input type="hidden" name="dates" value={JSON.stringify(dates)} />
        <button disabled={dates.length === 0} className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase disabled:opacity-40">
          Block {dates.length || ""} day{dates.length === 1 ? "" : "s"}
        </button>
      </div>
    </form>
  );
}
