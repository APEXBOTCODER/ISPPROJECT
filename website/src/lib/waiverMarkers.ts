// Admins place [[initial]] markers in the waiver body wherever the signer must
// initial. Each marker becomes a required initials box on the signing page and
// prints inline in the sealed PDF. This module is the single source of truth for
// parsing those markers so the form, the server action, and the PDF agree.

export const INITIAL_MARKER_RE = /\[\[initial\]\]/gi;

/** How many [[initial]] markers the body contains. */
export function countInitialMarkers(body: string): number {
  const m = body.match(INITIAL_MARKER_RE);
  return m ? m.length : 0;
}

/**
 * Split the body into text segments around each marker. For N markers this
 * returns N+1 segments; segment i is followed by initials box i (for i < N).
 */
export function splitByInitialMarkers(body: string): string[] {
  return body.split(INITIAL_MARKER_RE);
}

/**
 * Replace each [[initial]] marker with the entered initials rendered inline,
 * e.g. "[ JQP ]". Used when building the PDF. Extra/missing initials are handled
 * gracefully (missing → blank underscore slot).
 */
export function fillInitialMarkers(body: string, initials: string[]): string {
  let i = 0;
  return body.replace(INITIAL_MARKER_RE, () => {
    const val = (initials[i] ?? "").trim();
    i += 1;
    return val ? `[ ${val} ]` : "[ ____ ]";
  });
}

/** Parse the stored JSON initials column back into a string array. */
export function parseStoredInitials(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}
