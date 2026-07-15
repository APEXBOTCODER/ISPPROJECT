import { prisma } from "@/lib/prisma";

/**
 * Lowest off-peak rate (cents/hr) among active resources, keyed by sport.
 * Powers the "from $X/hr" copy on the Cricket/Soccer pages so those numbers
 * always track the rates admins set in /admin/resources. Sports with no active
 * resource are simply absent from the map (callers omit that clause).
 */
export async function minRateBySport(): Promise<Record<string, number>> {
  const resources = await prisma.resource.findMany({
    where: { active: true },
    select: { sport: true, baseRate: true },
  });

  const min: Record<string, number> = {};
  for (const r of resources) {
    if (min[r.sport] === undefined || r.baseRate < min[r.sport]) {
      min[r.sport] = r.baseRate;
    }
  }
  return min;
}
