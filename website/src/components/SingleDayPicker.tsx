"use client";

import { useState } from "react";
import MultiDayCalendar from "@/components/MultiDayCalendar";

/** Single-day calendar that writes the chosen date into a hidden form field. */
export default function SingleDayPicker({
  name,
  defaultValue,
  minDate,
  maxDate,
}: {
  name: string;
  defaultValue?: string;
  minDate: string;
  maxDate: string;
}) {
  const [date, setDate] = useState(defaultValue ?? "");
  return (
    <div>
      <MultiDayCalendar
        mode="single"
        value={date ? [date] : []}
        onChange={(d) => setDate(d[0] ?? "")}
        minDate={minDate}
        maxDate={maxDate}
      />
      <input type="hidden" name={name} value={date} />
    </div>
  );
}
