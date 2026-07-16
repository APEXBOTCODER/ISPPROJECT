"use client";

import { useState } from "react";

const SCRIPT_FONT =
  "'Segoe Script','Bradley Hand','Snell Roundhand','Brush Script MT',cursive";

/**
 * Full-legal-name field that doubles as the electronic signature: what the
 * signer types is mirrored below in a handwriting-style font as a live
 * signature preview. The same name is stored and printed on the sealed PDF.
 */
export default function SignatureNameField() {
  const [name, setName] = useState("");
  return (
    <div>
      <label htmlFor="signedName" className="block text-sm font-medium">
        Type your full legal name (electronic signature)
      </label>
      <input
        id="signedName"
        name="signedName"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
        className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
        placeholder="Jane Q. Public"
      />
      <div className="mt-2 flex items-center gap-3 rounded-md border border-dashed border-navy/25 bg-navy/[0.02] px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-navy/40">
          Signature
        </span>
        <span
          className="min-h-[2rem] text-3xl leading-none text-navy"
          style={{ fontFamily: SCRIPT_FONT }}
        >
          {name || " "}
        </span>
      </div>
    </div>
  );
}
