import { prisma } from "@/lib/prisma";

/** The current (highest-version, active) waiver document. */
export async function getCurrentWaiver() {
  return prisma.waiverDocument.findFirst({
    where: { active: true },
    orderBy: { version: "desc" },
  });
}

/** True when the user has signed the current waiver version for themselves. */
export async function hasCurrentWaiver(userId: string): Promise<boolean> {
  const current = await getCurrentWaiver();
  if (!current) return false;
  const signature = await prisma.waiverSignature.findFirst({
    where: { userId, version: current.version },
  });
  return Boolean(signature);
}
