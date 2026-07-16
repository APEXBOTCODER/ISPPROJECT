"use client";

import { splitByInitialMarkers } from "@/lib/waiverMarkers";

/**
 * Renders the waiver text and turns each [[initial]] marker into a required
 * inline "initials" box (initial_0, initial_1, …). With no markers it just shows
 * the text, so older waivers are unaffected.
 */
export default function WaiverBodyInitials({ body }: { body: string }) {
  const segments = splitByInitialMarkers(body);
  const boxes = segments.length - 1;

  return (
    <div className="mt-6 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-navy/15 bg-navy/[0.03] p-5 text-sm leading-7 text-navy/90">
      {segments.map((seg, i) => (
        <span key={i}>
          {seg}
          {i < boxes && (
            <input
              type="text"
              name={`initial_${i}`}
              required
              maxLength={6}
              autoComplete="off"
              aria-label={`Initials ${i + 1} of ${boxes}`}
              placeholder="✎"
              className="mx-1 inline-block w-16 rounded border border-sky/60 bg-white px-1 py-0.5 text-center text-xs font-bold uppercase tracking-wide text-navy focus:border-sky focus:outline-none focus:ring-1 focus:ring-sky/40"
            />
          )}
        </span>
      ))}
    </div>
  );
}
