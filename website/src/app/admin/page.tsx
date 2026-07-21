import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { parkNow } from "@/lib/availability";

export const metadata = { title: "Admin · Dashboard" };
export const dynamic = "force-dynamic";

function Kpi({ value, label, href }: { value: string; label: string; href?: string }) {
  const inner = (
    <div className="rounded-2xl bg-navy p-5 text-white">
      <div className="text-3xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-white/60">{label}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
}

export default async function AdminDashboardPage() {
  await requireStaff();
  const now = parkNow();

  const [upcomingCount, revenue, refundAgg, userCount, activeBlocks, recentBookings, recentRefunds] =
    await Promise.all([
      prisma.booking.count({ where: { status: "CONFIRMED", date: { gte: now.date } } }),
      // Revenue = money actually collected: confirmed bookings PLUS ones that were
      // paid and later cancelled (a late cancellation with a partial/zero refund
      // means we kept some/all of the money). Net = this minus refunds.
      prisma.booking.aggregate({
        where: { OR: [{ status: "CONFIRMED" }, { status: "CANCELLED", paymentRef: { not: null } }] },
        _sum: { totalCents: true },
      }),
      prisma.refundRecord.aggregate({ _sum: { amountCents: true } }),
      prisma.user.count(),
      prisma.booking.count({ where: { status: "BLOCKED", date: { gte: now.date } } }),
      prisma.booking.findMany({
        where: { status: { in: ["CONFIRMED", "CANCELLED"] } },
        include: { user: true, resource: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.refundRecord.findMany({
        where: { amountCents: { gt: 0 } }, // real refunds only; $0 cancellations aren't refunds
        include: { user: true, staff: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

  const grossRevenue = revenue._sum.totalCents ?? 0;
  const totalRefunded = refundAgg._sum.amountCents ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-4xl text-navy">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/bookings/new" className="btn-brand rounded-md px-4 py-2 text-sm font-bold uppercase">
            + New booking
          </Link>
          <Link href="/admin/maintenance" className="rounded-md border border-navy/20 px-4 py-2 text-sm font-bold uppercase text-navy hover:bg-navy/5">
            Block a slot
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi value={String(upcomingCount)} label="Upcoming confirmed bookings" href="/admin/bookings?filter=upcoming" />
        <Kpi value={formatCents(grossRevenue)} label="Revenue collected (all time)" href="/admin/reports" />
        <Kpi value={formatCents(totalRefunded)} label="Total refunded" href="/admin/refunds" />
        <Kpi value={String(userCount)} label="Registered users" href="/admin/users" />
        <Kpi value={String(activeBlocks)} label="Active maintenance blocks" href="/admin/maintenance" />
        <Kpi value={formatCents(grossRevenue - totalRefunded)} label="Net revenue" href="/admin/reports" />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {/* Recent bookings */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="display text-2xl text-navy">Recent bookings</h2>
            <Link href="/admin/bookings" className="text-sm font-semibold text-sky hover:underline">All →</Link>
          </div>
          {recentBookings.length === 0 ? (
            <p className="mt-3 text-sm text-navy/60">No bookings yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentBookings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy/10 px-4 py-2.5 text-sm">
                  <span className="text-navy/80">
                    <strong className="text-navy">{b.resource.name}</strong> · {b.date} · {b.startHour}:00–{b.endHour}:00
                    <span className="block text-xs text-navy/50">{b.user.name}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-navy/60">{formatCents(b.totalCents)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${b.status === "CONFIRMED" ? "bg-green-50 text-green-700 ring-green-200" : "bg-navy/5 text-navy/50 ring-navy/10"}`}>
                      {b.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent refunds */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="display text-2xl text-navy">Recent refunds</h2>
            <Link href="/admin/refunds" className="text-sm font-semibold text-sky hover:underline">All →</Link>
          </div>
          {recentRefunds.length === 0 ? (
            <p className="mt-3 text-sm text-navy/60">No refunds yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentRefunds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy/10 px-4 py-2.5 text-sm">
                  <span className="text-navy/80">
                    <strong className="text-navy">{formatCents(r.amountCents)}</strong> · {r.scope}
                    <span className="block text-xs text-navy/50">{r.user.name} · by {r.staff.name}</span>
                  </span>
                  <span className="text-xs text-navy/50">{r.createdAt.toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
