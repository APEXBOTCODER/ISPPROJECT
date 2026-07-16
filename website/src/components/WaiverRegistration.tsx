"use client";

import { useState } from "react";

const SCRIPT_FONT =
  "'Segoe Script','Bradley Hand','Snell Roundhand','Brush Script MT',cursive";
const field =
  "mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-navy/60";

/** Red asterisk marking a required field. */
const Req = () => (
  <span className="text-red-500" title="Required">
    {" *"}
  </span>
);

/**
 * Smartwaiver-equivalent registration block: participant type (Adult / Minor),
 * participant + guardian details, emergency contact, allergies/medical info,
 * the photo/media opt-out, and the typed legal name that doubles as the
 * electronic signature (with a live handwriting-style preview).
 */
export default function WaiverRegistration() {
  const [type, setType] = useState<"ADULT" | "MINOR">("ADULT");
  const [signedName, setSignedName] = useState("");
  const isMinor = type === "MINOR";

  return (
    <div className="space-y-5">
      <input type="hidden" name="participantType" value={type} />

      <p className="text-xs text-navy/50">
        Fields marked <span className="font-semibold text-red-500">*</span> are required.
      </p>

      {/* Who is participating */}
      <div>
        <span className={labelCls}>Who is participating?</span>
        <div className="mt-2 flex gap-2">
          {(["ADULT", "MINOR"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-md border px-4 py-2 text-sm font-semibold ${
                type === t
                  ? "border-sky bg-sky text-white"
                  : "border-navy/20 text-navy/70 hover:bg-navy/5"
              }`}
            >
              {t === "ADULT" ? "Adult (18+)" : "Minor (under 18)"}
            </button>
          ))}
        </div>
      </div>

      {/* Participant details */}
      <div className="rounded-xl border border-navy/10 p-4">
        <h3 className="text-sm font-bold text-navy">
          {isMinor ? "Minor participant" : "Participant"}
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {isMinor ? (
            <div>
              <label className={labelCls}>
                Minor&apos;s full legal name<Req />
                <input name="minorName" required className={field} placeholder="Alex Q. Public" />
              </label>
            </div>
          ) : (
            <div className="sm:col-span-2 text-xs text-navy/50">
              The adult participant is the person signing below.
            </div>
          )}
          <div>
            <label className={labelCls}>
              {isMinor ? "Minor's date of birth" : "Date of birth"}<Req />
              <input name="participantDob" type="date" required className={field} />
            </label>
          </div>
        </div>
      </div>

      {/* Contact + emergency */}
      <div className="rounded-xl border border-navy/10 p-4">
        <h3 className="text-sm font-bold text-navy">Contact &amp; emergency information</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              Phone<Req />
              <input name="phone" type="tel" required className={field} placeholder="(940) 555-0100" />
            </label>
          </div>
          <div>
            <label className={labelCls}>
              Address (optional)
              <input name="address" className={field} placeholder="Street, City, TX ZIP" />
            </label>
          </div>
          <div>
            <label className={labelCls}>
              Emergency contact name<Req />
              <input name="emergencyName" required className={field} placeholder="Full name" />
            </label>
          </div>
          <div>
            <label className={labelCls}>
              Emergency contact phone<Req />
              <input name="emergencyPhone" type="tel" required className={field} placeholder="(940) 555-0199" />
            </label>
          </div>
        </div>
      </div>

      {/* Medical */}
      <div className="rounded-xl border border-navy/10 p-4">
        <h3 className="text-sm font-bold text-navy">Medical information</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>
              Allergies (optional)
              <textarea name="allergies" rows={2} className={field} placeholder="e.g., bee stings, peanuts" />
            </label>
          </div>
          <div>
            <label className={labelCls}>
              Medical conditions / medications (optional)
              <textarea name="medical" rows={2} className={field} placeholder="e.g., asthma — carries inhaler" />
            </label>
          </div>
        </div>
      </div>

      {/* Guardian + signature */}
      <div className="rounded-xl border border-navy/10 p-4">
        <h3 className="text-sm font-bold text-navy">
          {isMinor ? "Parent / legal guardian signature" : "Signature"}
        </h3>
        {isMinor && (
          <div className="mt-3">
            <label className={labelCls}>
              Your relationship to the minor<Req />
              <input name="guardianRelation" required className={field} placeholder="Parent / Legal guardian" />
            </label>
          </div>
        )}
        <div className="mt-3">
          <label className={labelCls}>
            {isMinor
              ? "Your full legal name (parent/guardian electronic signature)"
              : "Your full legal name (electronic signature)"}
            <Req />
            <input
              name="signedName"
              required
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              autoComplete="name"
              className={field}
              placeholder="Jane Q. Public"
            />
          </label>
          <div className="mt-2 flex items-center gap-3 rounded-md border border-dashed border-navy/25 bg-navy/[0.02] px-4 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-navy/40">Signature</span>
            <span className="min-h-[2rem] text-3xl leading-none text-navy" style={{ fontFamily: SCRIPT_FONT }}>
              {signedName || " "}
            </span>
          </div>
        </div>
      </div>

      {/* Media release opt-out (Section 7) */}
      <label className="flex items-start gap-2 rounded-xl border border-navy/10 p-4 text-sm">
        <input type="checkbox" name="declineMedia" className="mt-0.5" />
        <span>
          <strong>Optional — decline the media release.</strong> Check this box to{" "}
          <em>opt out</em> of the photo/video/likeness release in Section 7. Leave it unchecked to grant
          the media release.
        </span>
      </label>
    </div>
  );
}
