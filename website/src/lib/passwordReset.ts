import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const RESET_TTL_MINUTES = 60;

/** Only the SHA-256 hash of a reset token is ever stored, so a DB read can't
 *  reveal a usable token. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issue a fresh single-use reset token for a user, invalidating any previous
 * ones. Returns the RAW token — it exists only in the emailed link, never in
 * the database or logs.
 */
export async function issueResetToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url"); // 256 bits of entropy
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    }),
  ]);
  return raw;
}

/** Return the token row if it's valid (exists, unconsumed, unexpired, and the
 *  account is still active), else null. */
export async function findValidResetToken(raw: string) {
  if (!raw) return null;
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { select: { id: true, active: true, name: true } } },
  });
  if (!token || token.consumedAt || token.expiresAt < new Date() || !token.user.active) {
    return null;
  }
  return token;
}
