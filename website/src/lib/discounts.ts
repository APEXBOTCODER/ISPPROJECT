import { prisma } from "@/lib/prisma";

export type DiscountKind = "PER_HOUR" | "PER_RESERVATION";

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Discount (cents) a code yields for a reservation of `totalHours` hours.
 *  PER_HOUR scales with hours; PER_RESERVATION is a flat amount. */
export function discountForHours(
  code: { kind: string; amountCents: number },
  totalHours: number
): number {
  if (code.kind === "PER_HOUR") return code.amountCents * Math.max(0, totalHours);
  return code.amountCents;
}

/** Load an active code by its (case-insensitive) value, or null. */
export async function findActiveCode(raw: string) {
  const code = normalizeCode(raw);
  if (!code) return null;
  return prisma.discountCode.findFirst({ where: { code, active: true } });
}

/** Whether a once-per-user code has already been redeemed by this account
 *  (a cancelled reservation does not burn the code). */
export async function alreadyRedeemed(userId: string, code: string): Promise<boolean> {
  const n = await prisma.reservation.count({
    where: { userId, discountCode: code, status: { not: "CANCELLED" } },
  });
  return n > 0;
}
