"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MultiDayCalendar from "@/components/MultiDayCalendar";

export default function ReportRangePicker({
  from,
  to,
  minDate,
  maxDate,
}: {
  from: string;
  to: string;
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const [dates, setDates] = useState<string[]>([]);
  const start = dates[0];
  const end = dates[dates.length - 1];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <MultiDayCalendar mode="range" value={dates} onChange={setDates} minDate={minDate} maxDate={maxDate} initialAnchor={to} />
      <div className="space-y-2">
        <p className="text-sm text-navy/70">
          Applied: <strong>{from}</strong> → <strong>{to}</strong>
        </p>
        <p className="text-xs text-navy/50">
          {start && end ? `New: ${start} → ${end}` : "Click a start day, then an end day."}
        </p>
        <button
          type="button"
          disabled={!start || !end}
          onClick={() => router.push(`/admin/reports?from=${start}&to=${end}`)}
          className="btn-brand rounded-md px-4 py-2 text-sm font-bold uppercase disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
