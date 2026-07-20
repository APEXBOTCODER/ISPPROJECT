import { randomInt } from "crypto";

// Avoids ambiguous characters (no I, O, 0, 1) so codes are easy to read/type
// into a Zelle memo.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short human-friendly reservation code, e.g. "ISP-ABC234". */
export function makeReservationCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(0, ALPHABET.length)];
  return `ISP-${s}`;
}
