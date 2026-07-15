"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type CalendarMode = "multi" | "single" | "range";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`; // m 0-based
function parse(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}
function addDaysStr(s: string, n: number) {
  const p = parse(s);
  const dt = new Date(p.y, p.m, p.d + n);
  return ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
function rangeBetween(a: string, b: string): string[] {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  let cur = lo;
  while (cur <= hi) {
    out.push(cur);
    cur = addDaysStr(cur, 1);
  }
  return out;
}

export default function MultiDayCalendar({
  value,
  onChange,
  minDate,
  maxDate,
  mode = "multi",
  initialAnchor,
}: {
  value: string[];
  onChange: (dates: string[]) => void;
  minDate: string;
  maxDate: string;
  mode?: CalendarMode;
  /** Month to open on when nothing is selected (clamped to the min/max range). */
  initialAnchor?: string;
}) {
  const clampedAnchor =
    initialAnchor && initialAnchor >= minDate && initialAnchor <= maxDate ? initialAnchor : minDate;
  const anchor = value[0] ?? clampedAnchor;
  const ap = parse(anchor);
  const [view, setView] = useState({ y: ap.y, m: ap.m });
  const selected = useMemo(() => new Set(value), [value]);

  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const dragging = useRef(false);

  const inRange = (s: string) => s >= minDate && s <= maxDate;

  // Commit a drag (multi mode) on global mouseup so releasing off-grid still works.
  useEffect(() => {
    function up() {
      if (!dragging.current) return;
      dragging.current = false;
      if (dragStart && dragEnd) {
        if (dragStart === dragEnd) {
          const next = new Set(selected);
          if (next.has(dragStart)) next.delete(dragStart);
          else next.add(dragStart);
          onChange([...next].sort());
        } else {
          const days = rangeBetween(dragStart, dragEnd).filter(inRange);
          const next = new Set(selected);
          const allSelected = days.every((d) => next.has(d));
          for (const d of days) {
            if (allSelected) next.delete(d);
            else next.add(d);
          }
          onChange([...next].sort());
        }
      }
      setDragStart(null);
      setDragEnd(null);
    }
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  });

  function onDayMouseDown(s: string) {
    if (!inRange(s)) return;
    if (mode === "single") {
      onChange([s]);
      return;
    }
    if (mode === "range") {
      if (!rangeAnchor) {
        setRangeAnchor(s);
        onChange([s]);
      } else {
        onChange(rangeBetween(rangeAnchor, s).filter(inRange));
        setRangeAnchor(null);
      }
      return;
    }
    // multi: begin (possible) drag
    dragging.current = true;
    setDragStart(s);
    setDragEnd(s);
  }

  function onDayMouseEnter(s: string) {
    if (mode === "multi" && dragging.current && inRange(s)) setDragEnd(s);
  }

  const preview = useMemo(() => {
    if (mode !== "multi" || !dragStart || !dragEnd) return null;
    return new Set(rangeBetween(dragStart, dragEnd).filter(inRange));
  }, [dragStart, dragEnd, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstWd = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(view.y, view.m, d));

  const canPrev = ymd(view.y, view.m, 1) > minDate;
  const canNext = ymd(view.y, view.m, daysInMonth) < maxDate;
  const shiftMonth = (delta: number) => {
    const dt = new Date(view.y, view.m + delta, 1);
    setView({ y: dt.getFullYear(), m: dt.getMonth() });
  };

  return (
    <div className="inline-block select-none rounded-xl border border-navy/15 p-3">
      <div className="flex items-center justify-between px-1">
        <button type="button" disabled={!canPrev} onClick={() => shiftMonth(-1)} aria-label="Previous month" className="rounded px-2 py-1 text-lg leading-none text-navy/70 hover:bg-navy/5 disabled:opacity-30">‹</button>
        <div className="text-sm font-semibold text-navy">{MONTHS[view.m]} {view.y}</div>
        <button type="button" disabled={!canNext} onClick={() => shiftMonth(1)} aria-label="Next month" className="rounded px-2 py-1 text-lg leading-none text-navy/70 hover:bg-navy/5 disabled:opacity-30">›</button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-navy/40">
        {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((s, i) => {
          if (!s) return <div key={`b${i}`} />;
          const disabled = !inRange(s);
          const isSel = selected.has(s) || (preview?.has(s) ?? false);
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onMouseDown={() => onDayMouseDown(s)}
              onMouseEnter={() => onDayMouseEnter(s)}
              className={`h-9 w-9 rounded-md text-sm transition-colors ${
                disabled
                  ? "cursor-not-allowed text-navy/20"
                  : isSel
                    ? "gradient-brand font-bold text-white"
                    : "text-navy hover:bg-navy/10"
              }`}
            >
              {Number(s.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
