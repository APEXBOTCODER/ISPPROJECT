/**
 * Validate a user-supplied post-action redirect target ("next"/"returnTo").
 *
 * Only same-site absolute paths are allowed (e.g. "/dashboard"). This blocks:
 *   - open redirects   ("https://evil.com", "//evil.com")
 *   - reflected XSS    ("javascript:...", "data:...") when the value is later
 *                       placed into an <a href> (React renders such URLs).
 *   - protocol-relative and backslash tricks ("/\\evil.com", "\\evil.com").
 */
export function safeNext(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || next.length === 0) return fallback;
  // Must be a single-slash-rooted path, and must not start a new host/scheme.
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Defense in depth: reject control chars and anything that isn't a plain path.
  if (/[\x00-\x1f]/.test(next)) return fallback;
  return next;
}
