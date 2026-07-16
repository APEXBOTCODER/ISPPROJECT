"use client";

import { Fragment } from "react";
import { splitByInitialMarkers } from "@/lib/waiverMarkers";

// A serif face gives the agreement a professional, legal-document feel.
const SERIF = "Georgia, 'Times New Roman', Times, serif";

/** Numbered section title, e.g. "3. ASSUMPTION OF RISK". */
function isHeading(p: string): boolean {
  return /^\d{1,2}\.\s+[A-Z]/.test(p) && p.length < 80;
}
/** Short ALL-CAPS conspicuous notice (e.g. the IMPORTANT banner, key clauses). */
function isEmphasis(p: string): boolean {
  return p.length < 240 && /[A-Z]/.test(p) && !/[a-z]/.test(p);
}

function InitialsBox({ index, total }: { index: number; total: number }) {
  return (
    <span className="mx-1.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2 py-1 align-middle font-sans shadow-sm ring-2 ring-amber-400">
      <span aria-hidden className="text-sm leading-none text-amber-600">✍</span>
      <span className="whitespace-nowrap text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
        Initials required
      </span>
      <input
        type="text"
        name={`initial_${index}`}
        required
        maxLength={6}
        autoComplete="off"
        aria-label={`Initials ${index + 1} of ${total}`}
        placeholder="____"
        className="w-16 rounded border-2 border-amber-500 bg-white px-1 py-0.5 text-center text-sm font-bold uppercase text-navy placeholder:font-normal placeholder:text-navy/30 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/50"
      />
    </span>
  );
}

/**
 * Renders the waiver text as a clean, paginated legal document (serif, generous
 * line-height, bold section headings) and turns each [[initial]] marker into a
 * highly visible amber "Initials required" box inline at that clause.
 */
export default function WaiverBodyInitials({ body }: { body: string }) {
  const segments = splitByInitialMarkers(body);
  const boxes = segments.length - 1;

  return (
    <div
      className="mt-4 max-h-[32rem] overflow-y-auto rounded-xl border border-navy/15 bg-white px-6 py-5 text-navy shadow-inner sm:px-8"
      style={{ fontFamily: SERIF }}
    >
      {segments.map((seg, i) => {
        const paras = seg.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
        return (
          <Fragment key={i}>
            {paras.map((p, j) => {
              const showInput = j === paras.length - 1 && i < boxes;
              const heading = isHeading(p);
              const emph = !heading && isEmphasis(p);
              const cls = heading
                ? "mt-6 mb-2 text-base font-bold tracking-wide text-navy"
                : emph
                ? "my-3 text-[13.5px] font-semibold leading-7 text-navy"
                : "my-3 text-[15px] leading-8 text-navy/90";
              return (
                <p key={j} className={cls}>
                  {p}
                  {showInput && <InitialsBox index={i} total={boxes} />}
                </p>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}
