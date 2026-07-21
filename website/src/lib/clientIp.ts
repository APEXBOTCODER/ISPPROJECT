import { headers } from "next/headers";

/**
 * Best-effort client IP for rate-limiting and audit records.
 *
 * SECURITY: `X-Forwarded-For` is a client-settable header; only values written
 * by *your own* proxy are trustworthy. We therefore prefer `X-Real-IP` (which
 * nginx/Lightsail sets to the real peer via `proxy_set_header X-Real-IP
 * $remote_addr`), and fall back to the RIGHT-most XFF entry (the hop closest to
 * our proxy) rather than the left-most (which an attacker fully controls).
 *
 * Make sure the edge proxy OVERWRITES these headers on ingress so a spoofed
 * value from the client cannot survive.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
