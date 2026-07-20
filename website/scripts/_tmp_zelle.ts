import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { slotKey } from "@/lib/availability";
import { makeReservationCode } from "@/lib/reservationCode";
function addDays(d: string, n: number) { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
async function main() {
  const admin = await prisma.user.findUnique({ where: { email: "admin@infinitysportspark.com" } });
  const res0 = await prisma.resource.findFirst({ where: { active: true } });
  if (!admin || !res0) return;
  const date = addDays(new Date().toISOString().slice(0, 10), 40);
  const code = makeReservationCode();
  const reservation = await prisma.reservation.create({
    data: { userId: admin.id, code, kind: "BOOKING", label: "Test Zelle Co", totalCents: 6000, status: "PENDING_PAYMENT" },
  });
  const booking = await prisma.booking.create({
    data: { userId: admin.id, reservationId: reservation.id, resourceId: res0.id, date, startHour: 8, endHour: 10, status: "PENDING_PAYMENT", totalCents: 6000 },
  });
  await prisma.bookingSlot.createMany({ data: [8, 9].map((h) => ({ bookingId: booking.id, resourceId: res0.id, slotKey: slotKey(date, h) })) });
  console.log(JSON.stringify({ reservationId: reservation.id, code, adminId: admin.id, date }));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
