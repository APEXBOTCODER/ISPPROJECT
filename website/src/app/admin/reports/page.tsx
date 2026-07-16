import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { parkNow } from "@/lib/availability";
import ReportRangePicker from "@/components/ReportRangePicker";

export const metadata = { title: "Admin · Reports" };
export const dynamic = "force-dynamic";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysInclusive(from: string, to: string): number {
  return Math.max(
    0,
    Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000) + 1
  );
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireStaff();
  const now = parkNow();
  const sp = await searchParams;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : now.date;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : addDays(to, -29);
  const nextDay = addDays(to, 1);

  const rangeStart = new Date(`${from}T00:00:00`);
  const rangeEnd = new Date(`${nextDay}T00:00:00`);

  const [resources, revenueAgg, bookingCount, cancelledCount, noShowCount, refundAgg, refundCount] =
    await Promise.all([
      prisma.resource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      prisma.booking.aggregate({
        where: { status: "CONFIRMED", date: { gte: from, lte: to } },
        _sum: { totalCents: true },
      }),
      prisma.booking.count({ where: { status: "CONFIRMED", date: { gte: from, lte: to } } }),
      // Cancellations counted by WHEN they were cancelled (refund-record timestamp),
      // so the number lines up with the refunds issued in the same range.
      prisma.refundRecord.count({
        where: { cancelled: true, createdAt: { gte: rangeStart, lt: rangeEnd } },
      }),
      prisma.booking.count({ where: { status: "CONFIRMED", noShow: true, date: { gte: from, lte: to } } }),
      prisma.refundRecord.aggregate({
        where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
        _sum: { amountCents: true },
      }),
      prisma.refundRecord.count({ where: { createdAt: { gte: rangeStart, lt: rangeEnd } } }),
    ]);

  const revenue = revenueAgg._sum.totalCents ?? 0;
  const refunded = refundAgg._sum.amountCents ?? 0;
  const numDays = daysInclusive(from, to);

  // Utilization per facility: booked confirmed slot-hours ÷ available slot-hours.
  const util = await Promise.all(
    resources.map(async (r) => {
      const booked = await prisma.bookingSlot.count({
        where: {
          resourceId: r.id,
          slotKey: { gte: `${from}:00`, lte: `${to}:99` },
          booking: { status: "CONFIRMED" },
        },
      });
      const available = (r.closeHour - r.openHour) * numDays;
      return { name: r.name, booked, available, pct: available > 0 ? Math.round((booked / available) * 100) : 0 };
    })
  );

  const stat = (label: string, value: string) => (
    <div className="rounded-2xl bg-navy p-5 text-white">
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-white/60">{label}</div>
    </div>
  );

  return (
    <div>
      <h1 className="display text-4xl text-navy">Reports</h1>
      <p className="mt-2 text-sm text-navy/60">Revenue, refunds, and utilization for a date range (by session date).</p>

      <div className="mt-4">
        <ReportRangePicker from={from} to={to} minDate={addDays(now.date, -365)} maxDate={addDays(now.date, 90)} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {stat("Confirmed revenue", formatCents(revenue))}
        {stat(refundCount === 1 ? "Refunded (1 refund)" : `Refunded (${refundCount} refunds)`, formatCents(refunded))}
        {stat("Net", formatCents(revenue - refunded))}
        {stat("Bookings", String(bookingCount))}
        {stat("Cancelled", String(cancelledCount))}
        {stat("No-shows", String(noShowCount))}
      </div>
      <p className="mt-2 text-xs text-navy/50">
        Revenue &amp; bookings are counted by session date; refunds &amp; cancellations by the date they were processed.
      </p>

      <section className="mt-10">
        <h2 className="display text-2xl text-navy">Utilization by facility ({numDays} days)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-navy/15 text-xs uppercase text-navy/50">
                <th className="py-2 pr-4">Facility</th>
                <th className="py-2 pr-4">Booked hrs</th>
                <th className="py-2 pr-4">Available hrs</th>
                <th className="py-2">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {util.map((u) => (
                <tr key={u.name} className="border-b border-navy/5">
                  <td className="py-2.5 pr-4 font-medium text-navy">{u.name}</td>
                  <td className="py-2.5 pr-4">{u.booked}</td>
                  <td className="py-2.5 pr-4 text-navy/60">{u.available}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-navy/10">
                        <div className="h-full rounded-full bg-pitch" style={{ width: `${Math.min(100, u.pct)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-navy/70">{u.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
