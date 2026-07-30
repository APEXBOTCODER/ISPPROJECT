import { createHash, createCipheriv, createDecipheriv, randomBytes, scryptSync, randomInt } from "crypto";
import * as OTPAuth from "otpauth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";

/** 32-byte AES key derived from AUTH_SECRET, so TOTP secrets are encrypted at
 *  rest (a DB leak alone doesn't yield working 2FA secrets). */
function encKey(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is required for 2FA.");
  return scryptSync(s, "isp-totp-key-v1", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(enc: string): string {
  const [ivB, tagB, ctB] = enc.split(":");
  const d = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB, "base64"));
  d.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([d.update(Buffer.from(ctB, "base64")), d.final()]).toString("utf8");
}

export function newSecretBase32(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function makeTotp(secretBase32: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: config.siteName,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** otpauth:// URI for the authenticator-app QR / manual entry. */
export function totpUri(secretBase32: string, email: string): string {
  return makeTotp(secretBase32, email).toString();
}

/** Validate a 6-digit TOTP with a ±1 step window (clock drift tolerance). */
export function verifyTotp(secretBase32: string, token: string): boolean {
  const clean = token.replace(/\D/g, "");
  if (clean.length !== 6) return false;
  return makeTotp(secretBase32, "user").validate({ token: clean, window: 1 }) !== null;
}

// ── One-time backup codes ────────────────────────────────────────────────────
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let c = "";
    for (let j = 0; j < 10; j++) c += ALPHABET[randomInt(ALPHABET.length)];
    codes.push(`${c.slice(0, 5)}-${c.slice(5)}`);
  }
  return codes;
}

const normalizeCode = (code: string) => code.replace(/[\s-]/g, "").toUpperCase();
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}
export function hashBackupCodes(codes: string[]): string {
  return JSON.stringify(codes.map(hashBackupCode));
}

/**
 * Verify a submitted second factor — a TOTP code OR a one-time backup code —
 * for a user. A matching backup code is consumed (removed). Returns true on
 * success. Safe to call in the auth flow (does its own DB write for backup use).
 */
export async function verifyAndConsumeSecondFactor(
  user: { id: string; totpSecret: string | null; totpBackupCodes: string | null },
  code: string
): Promise<boolean> {
  if (!code) return false;
  // TOTP first.
  if (user.totpSecret) {
    try {
      if (verifyTotp(decryptSecret(user.totpSecret), code)) return true;
    } catch {
      /* fall through to backup codes */
    }
  }
  // Then a one-time backup code.
  if (user.totpBackupCodes) {
    let hashes: string[] = [];
    try {
      hashes = JSON.parse(user.totpBackupCodes);
    } catch {
      hashes = [];
    }
    const idx = hashes.indexOf(hashBackupCode(code));
    if (idx !== -1) {
      hashes.splice(idx, 1);
      await prisma.user.update({ where: { id: user.id }, data: { totpBackupCodes: JSON.stringify(hashes) } });
      return true;
    }
  }
  return false;
}
