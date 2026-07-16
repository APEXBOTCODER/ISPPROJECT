import { prisma } from "@/lib/prisma";

/** The current (highest-version, active) waiver document. */
export async function getCurrentWaiver() {
  return prisma.waiverDocument.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
  });
}

/**
 * True when the user has a valid signature for the current waiver version.
 * A staff-issued "re-sign required" flag invalidates any signature made before
 * it, forcing the user to sign again before their next booking.
 */
export async function hasCurrentWaiver(userId: string): Promise<boolean> {
  const current = await getCurrentWaiver();
  if (!current) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { waiverResignRequiredAt: true },
  });
  const signature = await prisma.waiverSignature.findFirst({
    where: {
      userId,
      version: current.version,
      ...(user?.waiverResignRequiredAt
        ? { signedAt: { gte: user.waiverResignRequiredAt } }
        : {}),
    },
  });
  return Boolean(signature);
}
