// Integrity check: fire N concurrent transactions for the SAME slot and
// verify exactly one wins. Run: npx tsx scripts/test-double-booking.ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  }),
});

async function tryBook(userId: string, resourceId: string, attempt: number) {
  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          userId,
          resourceId,
          date: "2099-01-01",
          startHour: 10,
          endHour: 11,
          status: "CONFIRMED",
          totalCents: 5000,
          notes: `double-booking test attempt ${attempt}`,
        },
      });
      await tx.bookingSlot.createMany({
        data: [{ bookingId: booking.id, resourceId, slotKey: "2099-01-01:10" }],
      });
    });
    return true;
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") return false;
    throw error;
  }
}

async function main() {
  const user = await prisma.user.findFirstOrThrow();
  const resource = await prisma.resource.findFirstOrThrow();

  // clean any previous test rows
  await prisma.booking.deleteMany({ where: { date: "2099-01-01" } });

  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => tryBook(user.id, resource.id, i))
  );
  const wins = results.filter(Boolean).length;
  const slots = await prisma.bookingSlot.count({
    where: { resourceId: resource.id, slotKey: "2099-01-01:10" },
  });

  console.log(`Concurrent attempts: 10 · succeeded: ${wins} · slot rows: ${slots}`);
  if (wins === 1 && slots === 1) {
    console.log("PASS — exactly one booking won the slot.");
  } else {
    console.error("FAIL — double-booking guard did not hold!");
    process.exitCode = 1;
  }

  // Leave failed PENDING noise out: remove the test booking
  await prisma.booking.deleteMany({ where: { date: "2099-01-01" } });
}

main().finally(() => prisma.$disconnect());
