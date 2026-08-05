import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { parkNow } from "@/lib/availability";
import ReportRangePicker from "@/components/ReportRangePicker";
import UserRevenueSelect from "@/components/UserRevenueSelect";

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
  searchParams: Promise<{ from?: string; to?: string; users?: string }>;
}) {
  await requireStaff();
  const now = parkNow();
  const sp = await searchParams;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : now.date;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : addDays(to, -29);
  const nextDay = addDays(to, 1);

  const rangeStart = new Date(`${from}T00:00:00`);
  const rangeEnd = new Date(`${nextDay}T00:00:00`);

  const [resources, revenueAgg, planPaymentsAgg, duesAgg, activePlans, bookingCount, cancelledCount, noShowCount, refundAgg, refundCount] =
    await Promise.all([
      prisma.resource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      // Revenue = money collected: confirmed + paid-then-cancelled (we kept the
      // non-refunded portion), EXCLUDING payment-plan bookings — those are counted
      // by actual payments received (planPaymentsAgg), not their full total.
      prisma.booking.aggregate({
        where: {
          AND: [
            { OR: [{ status: "CONFIRMED" }, { status: "CANCELLED", paymentRef: { not: null } }] },
            { OR: [{ reservationId: null }, { reservation: { paymentPlan: false } }] },
          ],
          date: { gte: from, lte: to },
        },
        _sum: { totalCents: true },
      }),
      // Cash collected on payment plans, counted by the date each payment was
      // received (that's when the money actually came in).
      prisma.payment.aggregate({
        where: { createdAt: { gte: rangeStart, lt: rangeEnd } },
        _sum: { amountCents: true },
      }),
      // Outstanding dues across active plans — a point-in-time figure, not ranged.
      prisma.reservation.aggregate({
        where: { paymentPlan: true, status: { not: "CANCELLED" } },
        _sum: { totalCents: true, paidCents: true },
      }),
      prisma.reservation.findMany({
        where: { paymentPlan: true, status: { not: "CANCELLED" } },
        select: { id: true, label: true, totalCents: true, paidCents: true, code: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
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
      prisma.refundRecord.count({ where: { amountCents: { gt: 0 }, createdAt: { gte: rangeStart, lt: rangeEnd } } }),
    ]);

  const revenue = (revenueAgg._sum.totalCents ?? 0) + (planPaymentsAgg._sum.amountCents ?? 0);
  const refunded = refundAgg._sum.amountCents ?? 0;
  const outstandingDues = Math.max(0, (duesAgg._sum.totalCents ?? 0) - (duesAgg._sum.paidCents ?? 0));
  const numDays = daysInclusive(from, to);

  // Revenue by user (only when specific users are selected).
  const userIds = (sp.users ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let userRevenue: { id: string; name: string; email: string; bookings: number; revenue: number; refunds: number }[] = [];
  let selectedUsers: { id: string; name: string }[] = [];
  if (userIds.length) {
    const [selUsers, revByUser, planPayByUser, refByUser] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
      prisma.booking.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
          date: { gte: from, lte: to },
          AND: [
            { OR: [{ status: "CONFIRMED" }, { status: "CANCELLED", paymentRef: { not: null } }] },
            { OR: [{ reservationId: null }, { reservation: { paymentPlan: false } }] },
          ],
        },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      // Plan payments this user made in the range (money actually collected).
      prisma.payment.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds }, createdAt: { gte: rangeStart, lt: rangeEnd } },
        _sum: { amountCents: true },
      }),
      prisma.refundRecord.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds }, createdAt: { gte: rangeStart, lt: rangeEnd } },
        _sum: { amountCents: true },
      }),
    ]);
    const revMap = new Map(revByUser.map((r) => [r.userId, { sum: r._sum.totalCents ?? 0, count: r._count._all }]));
    const planPayMap = new Map(planPayByUser.map((r) => [r.userId, r._sum.amountCents ?? 0]));
    const refMap = new Map(refByUser.map((r) => [r.userId, r._sum.amountCents ?? 0]));
    userRevenue = selUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      bookings: revMap.get(u.id)?.count ?? 0,
      revenue: (revMap.get(u.id)?.sum ?? 0) + (planPayMap.get(u.id) ?? 0),
      refunds: refMap.get(u.id) ?? 0,
    }));
    selectedUsers = selUsers.map((u) => ({ id: u.id, name: u.name }));
  }

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
        {stat("Revenue collected", formatCents(revenue))}
        {stat(refundCount === 1 ? "Refunded (1 refund)" : `Refunded (${refundCount} refunds)`, formatCents(refunded))}
        {stat("Net", formatCents(revenue - refunded))}
        {stat("Bookings", String(bookingCount))}
        {stat("Cancelled", String(cancelledCount))}
        {stat("Outstanding dues", formatCents(outstandingDues))}
      </div>
      <p className="mt-2 text-xs text-navy/50">
        Revenue &amp; bookings are counted by session date; plan payments, refunds &amp; cancellations by the date they were
        processed. Outstanding dues is a live total across all active payment plans (not limited to the date range).
        No-shows in range: {noShowCount}.
      </p>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-2xl text-navy">Payment plans ({activePlans.length} active)</h2>
          <a href="/admin/installments" className="text-sm font-semibold text-sky hover:underline">Manage →</a>
        </div>
        <p className="mt-1 text-sm text-navy/60">
          Live view of active installment reservations and what each customer still owes.
        </p>
        {activePlans.length === 0 ? (
          <p className="mt-3 text-sm text-navy/60">No active payment plans.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase text-navy/50">
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Reservation</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Paid</th>
                  <th className="py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {activePlans.map((p) => (
                  <tr key={p.id} className="border-b border-navy/5">
                    <td className="py-2.5 pr-4">
                      <span className="font-medium text-navy">{p.user.name}</span>
                      <span className="block text-xs text-navy/50">{p.user.email}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-navy/70">{p.label || "—"}{p.code ? <span className="block text-xs text-navy/40">{p.code}</span> : null}</td>
                    <td className="py-2.5 pr-4">{formatCents(p.totalCents)}</td>
                    <td className="py-2.5 pr-4 text-navy/60">{formatCents(p.paidCents)}</td>
                    <td className="py-2.5 font-semibold text-navy">{formatCents(Math.max(0, p.totalCents - p.paidCents))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-navy/15 font-bold text-navy">
                  <td className="py-2 pr-4" colSpan={2}>Total</td>
                  <td className="py-2 pr-4">{formatCents(activePlans.reduce((s, p) => s + p.totalCents, 0))}</td>
                  <td className="py-2 pr-4">{formatCents(activePlans.reduce((s, p) => s + p.paidCents, 0))}</td>
                  <td className="py-2">{formatCents(outstandingDues)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="display text-2xl text-navy">Revenue by user</h2>
        <p className="mt-1 text-sm text-navy/60">
          Search and select one or more users to see their confirmed revenue (minus refunds) for the
          date range above.
        </p>
        <div className="mt-3">
          <UserRevenueSelect from={from} to={to} initial={selectedUsers} />
        </div>
        {userRevenue.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase text-navy/50">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Bookings</th>
                  <th className="py-2 pr-4">Revenue</th>
                  <th className="py-2 pr-4">Refunds</th>
                  <th className="py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {userRevenue.map((u) => (
                  <tr key={u.id} className="border-b border-navy/5">
                    <td className="py-2.5 pr-4">
                      <span className="font-medium text-navy">{u.name}</span>
                      <span className="block text-xs text-navy/50">{u.email}</span>
                    </td>
                    <td className="py-2.5 pr-4">{u.bookings}</td>
                    <td className="py-2.5 pr-4">{formatCents(u.revenue)}</td>
                    <td className="py-2.5 pr-4 text-navy/60">{formatCents(u.refunds)}</td>
                    <td className="py-2.5 font-semibold text-navy">{formatCents(u.revenue - u.refunds)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-navy/15 font-bold text-navy">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4">{userRevenue.reduce((s, u) => s + u.bookings, 0)}</td>
                  <td className="py-2 pr-4">{formatCents(userRevenue.reduce((s, u) => s + u.revenue, 0))}</td>
                  <td className="py-2 pr-4">{formatCents(userRevenue.reduce((s, u) => s + u.refunds, 0))}</td>
                  <td className="py-2">{formatCents(userRevenue.reduce((s, u) => s + u.revenue - u.refunds, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

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
