import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { parkNow } from "@/lib/availability";
import { adminCancelBooking, createBlock, removeBlock } from "./actions";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireStaff();
  const { error, ok } = await searchParams;
  const now = parkNow();

  const [resources, upcoming, blocks, users, revenueAgg] = await Promise.all([
    prisma.resource.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.booking.findMany({
      where: { status: "CONFIRMED", date: { gte: now.date } },
      include: { user: true, resource: true },
      orderBy: [{ date: "asc" }, { startHour: "asc" }],
      take: 100,
    }),
    prisma.booking.findMany({
      where: { status: "BLOCKED", date: { gte: now.date } },
      include: { resource: true },
      orderBy: [{ date: "asc" }, { startHour: "asc" }],
    }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.booking.aggregate({
      where: { status: "CONFIRMED" },
      _sum: { totalCents: true },
      _count: true,
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="display text-4xl text-navy">Admin · Operations</h1>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-navy p-5 text-white">
          <div className="text-3xl font-bold">{upcoming.length}</div>
          <div className="text-sm text-white/60">Upcoming confirmed bookings</div>
        </div>
        <div className="rounded-2xl bg-navy p-5 text-white">
          <div className="text-3xl font-bold">
            {formatCents(revenueAgg._sum.totalCents ?? 0)}
          </div>
          <div className="text-sm text-white/60">
            Confirmed revenue ({revenueAgg._count} bookings, all time)
          </div>
        </div>
        <div className="rounded-2xl bg-navy p-5 text-white">
          <div className="text-3xl font-bold">{users.length}</div>
          <div className="text-sm text-white/60">Registered users (latest 50)</div>
        </div>
      </div>

      {/* Maintenance blocks */}
      <section className="mt-10 rounded-2xl border border-navy/10 p-5">
        <h2 className="display text-2xl text-navy">Maintenance blocks</h2>
        <form action={createBlock} className="mt-4 grid gap-3 sm:grid-cols-6">
          <select name="resourceId" required className="rounded-md border border-navy/20 px-2 py-2 text-sm sm:col-span-2">
            {resources.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <input type="date" name="date" required min={now.date} className="rounded-md border border-navy/20 px-2 py-2 text-sm" />
          <select name="startHour" required className="rounded-md border border-navy/20 px-2 py-2 text-sm" aria-label="Start hour">
            {Array.from({ length: 17 }, (_, i) => i + 6).map((h) => (
              <option key={h} value={h}>{h}:00</option>
            ))}
          </select>
          <select name="endHour" required defaultValue={12} className="rounded-md border border-navy/20 px-2 py-2 text-sm" aria-label="End hour">
            {Array.from({ length: 18 }, (_, i) => i + 7).map((h) => (
              <option key={h} value={h}>{h}:00</option>
            ))}
          </select>
          <button className="btn-brand rounded-md px-3 py-2 text-sm font-bold uppercase">Block</button>
          <input
            name="reason"
            placeholder="Reason (e.g., pitch maintenance)"
            className="rounded-md border border-navy/20 px-3 py-2 text-sm sm:col-span-6"
          />
        </form>

        {blocks.length > 0 && (
          <ul className="mt-4 space-y-2">
            {blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-sm ring-1 ring-amber-200">
                <span>
                  <strong>{b.resource.name}</strong> · {b.date} · {b.startHour}:00–{b.endHour}:00
                  {b.notes ? ` · ${b.notes}` : ""}
                </span>
                <form action={removeBlock}>
                  <input type="hidden" name="blockId" value={b.id} />
                  <button className="rounded-md border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Upcoming bookings */}
      <section className="mt-10">
        <h2 className="display text-2xl text-navy">Upcoming bookings — all fields</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-navy/60">No upcoming bookings.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase text-navy/50">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Facility</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((b) => (
                  <tr key={b.id} className="border-b border-navy/5">
                    <td className="py-2.5 pr-4">{b.date}</td>
                    <td className="py-2.5 pr-4">{b.startHour}:00–{b.endHour}:00</td>
                    <td className="py-2.5 pr-4 font-medium">{b.resource.name}</td>
                    <td className="py-2.5 pr-4">
                      {b.user.name}
                      <span className="block text-xs text-navy/50">{b.user.email}</span>
                    </td>
                    <td className="py-2.5 pr-4">{formatCents(b.totalCents)}</td>
                    <td className="py-2.5">
                      <form action={adminCancelBooking}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <button className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                          Cancel + refund
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Users */}
      <section className="mt-10">
        <h2 className="display text-2xl text-navy">Recent users</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-navy/15 text-xs uppercase text-navy/50">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-navy/5">
                  <td className="py-2.5 pr-4 font-medium">{u.name}</td>
                  <td className="py-2.5 pr-4">{u.email}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.role === "ADMIN" ? "bg-sky/10 text-sky-deep" : u.role === "STAFF" ? "bg-pitch/10 text-pitch-deep" : "bg-navy/5 text-navy/60"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-2.5">{u.createdAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
