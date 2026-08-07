import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { parkNow } from "@/lib/availability";
import { userAccountSummary } from "@/lib/installments";
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

  const [resources, resAgg, advDepAgg, creditAgg, standaloneAgg, activePlansRaw, bookingCount, cancelledCount, noShowCount, refundAgg, refundCount] =
    await Promise.all([
      prisma.resource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
      // Financials below are a snapshot "to date", based on the amount ACTUALLY
      // PAID on each non-cancelled reservation (not the full booking price), so
      // partial payments, corrections, and advances are reflected correctly.
      prisma.reservation.aggregate({
        where: { kind: "BOOKING", status: { not: "CANCELLED" } },
        _sum: { paidCents: true, totalCents: true },
      }),
      prisma.payment.aggregate({ where: { kind: "ADVANCE" }, _sum: { amountCents: true } }),
      prisma.payment.aggregate({ where: { kind: "CREDIT" }, _sum: { amountCents: true } }),
      prisma.booking.aggregate({
        where: {
          reservationId: null,
          OR: [{ status: "CONFIRMED" }, { status: "CANCELLED", paymentRef: { not: null } }],
        },
        _sum: { totalCents: true },
      }),
      // Reservations still owing (payment plans / recorded-as-due) with balance > 0.
      prisma.reservation.findMany({
        where: { paymentPlan: true, status: { not: "CANCELLED" } },
        select: { id: true, label: true, totalCents: true, paidCents: true, code: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      }),
      // Activity metrics stay date-ranged (by session date).
      prisma.booking.count({ where: { status: "CONFIRMED", date: { gte: from, lte: to } } }),
      prisma.refundRecord.count({
        where: { cancelled: true, createdAt: { gte: rangeStart, lt: rangeEnd } },
      }),
      prisma.booking.count({ where: { status: "CONFIRMED", noShow: true, date: { gte: from, lte: to } } }),
      // Refunds to date (for the net-collected figure).
      prisma.refundRecord.aggregate({ _sum: { amountCents: true } }),
      prisma.refundRecord.count({ where: { amountCents: { gt: 0 } } }),
    ]);

  const advanceOnFile = (advDepAgg._sum.amountCents ?? 0) - (creditAgg._sum.amountCents ?? 0);
  const revenue = (resAgg._sum.paidCents ?? 0) + advanceOnFile + (standaloneAgg._sum.totalCents ?? 0);
  const refunded = refundAgg._sum.amountCents ?? 0;
  const outstandingDues = Math.max(0, (resAgg._sum.totalCents ?? 0) - (resAgg._sum.paidCents ?? 0));
  const activePlans = activePlansRaw.filter((p) => p.totalCents - p.paidCents > 0); // still owing
  const numDays = daysInclusive(from, to);

  // Per-customer account snapshot (only when specific users are selected).
  const userIds = (sp.users ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let userRevenue: { id: string; name: string; email: string; billed: number; paid: number; advance: number; balance: number }[] = [];
  let selectedUsers: { id: string; name: string }[] = [];
  if (userIds.length) {
    const selUsers = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
    userRevenue = await Promise.all(
      selUsers.map(async (u) => {
        const s = await userAccountSummary(u.id);
        return { id: u.id, name: u.name, email: u.email, billed: s.billedCents, paid: s.paidCents, advance: s.advanceCents, balance: s.balanceCents };
      })
    );
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
      <p className="mt-2 text-sm text-navy/60">
        Financial totals are a live snapshot (to date), based on the amount actually paid. Activity counts and
        utilization are for the date range below (by session date).
      </p>

      <div className="mt-4">
        <ReportRangePicker from={from} to={to} minDate={addDays(now.date, -365)} maxDate={addDays(now.date, 90)} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {stat("Collected (to date)", formatCents(revenue))}
        {stat("Outstanding dues", formatCents(outstandingDues))}
        {stat(refundCount === 1 ? "Refunded (1)" : `Refunded (${refundCount})`, formatCents(refunded))}
        {stat("Net collected", formatCents(revenue - refunded))}
        {stat(`Bookings (${numDays}d)`, String(bookingCount))}
        {stat(`Cancelled (${numDays}d)`, String(cancelledCount))}
      </div>
      <p className="mt-2 text-xs text-navy/50">
        Collected = money actually received (payments + advances on file). Outstanding dues = still owed across all
        reservations. Both are live to-date totals, not limited to the date range. No-shows in range: {noShowCount}.
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
        <h2 className="display text-2xl text-navy">Account by customer</h2>
        <p className="mt-1 text-sm text-navy/60">
          Search and select one or more customers to see, per customer: total booked, paid, advance on file, and the
          net balance (owed or credit). This is a live snapshot, not limited to the date range.
        </p>
        <div className="mt-3">
          <UserRevenueSelect from={from} to={to} initial={selectedUsers} />
        </div>
        {userRevenue.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase text-navy/50">
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Booked</th>
                  <th className="py-2 pr-4">Paid</th>
                  <th className="py-2 pr-4">Advance</th>
                  <th className="py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {userRevenue.map((u) => (
                  <tr key={u.id} className="border-b border-navy/5">
                    <td className="py-2.5 pr-4">
                      <span className="font-medium text-navy">{u.name}</span>
                      <span className="block text-xs text-navy/50">{u.email}</span>
                    </td>
                    <td className="py-2.5 pr-4">{formatCents(u.billed)}</td>
                    <td className="py-2.5 pr-4">{formatCents(u.paid)}</td>
                    <td className="py-2.5 pr-4 text-navy/60">{formatCents(u.advance)}</td>
                    <td className={`py-2.5 font-semibold ${u.balance > 0 ? "text-amber-700" : u.balance < 0 ? "text-green-700" : "text-navy"}`}>
                      {u.balance > 0
                        ? `${formatCents(u.balance)} due`
                        : u.balance < 0
                          ? `${formatCents(-u.balance)} credit`
                          : "Settled"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-navy/15 font-bold text-navy">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4">{formatCents(userRevenue.reduce((s, u) => s + u.billed, 0))}</td>
                  <td className="py-2 pr-4">{formatCents(userRevenue.reduce((s, u) => s + u.paid, 0))}</td>
                  <td className="py-2 pr-4">{formatCents(userRevenue.reduce((s, u) => s + u.advance, 0))}</td>
                  <td className="py-2">{formatCents(userRevenue.reduce((s, u) => s + u.balance, 0))}</td>
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
