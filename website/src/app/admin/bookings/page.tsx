import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parkNow, releaseExpiredUnpaid } from "@/lib/availability";
import RefundWorkbench, {
  type WorkbenchReservation,
  type WorkbenchStandalone,
} from "@/components/RefundWorkbench";
import { formatCents } from "@/lib/pricing";
import { getBookingPolicy, refundPercentForPolicy } from "@/lib/policy";
import { hoursUntilStart } from "@/lib/reservations";
import { bulkRefund } from "@/app/admin/refunds/actions";
import { toggleNoShow, confirmReservationPayment, confirmAllForUser, rejectReservationPayment } from "./actions";

export const metadata = { title: "Admin · Bookings & refunds" };
export const dynamic = "force-dynamic";

type Filter = "all" | "upcoming" | "past";

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; filter?: string }>;
}) {
  await requireStaff();
  const { error, ok, filter: filterParam } = await searchParams;
  const filter: Filter =
    filterParam === "upcoming" || filterParam === "past" ? filterParam : "all";
  const now = parkNow();
  await releaseExpiredUnpaid();

  const [reservationRows, standaloneRows, pendingRows] = await Promise.all([
    prisma.reservation.findMany({
      where: { kind: "BOOKING", status: { not: "PENDING_PAYMENT" } },
      include: {
        user: true,
        bookings: { include: { resource: true }, orderBy: [{ date: "asc" }, { startHour: "asc" }] },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.booking.findMany({
      where: { reservationId: null, status: { not: "BLOCKED" } },
      include: { user: true, resource: true },
      orderBy: [{ date: "desc" }, { startHour: "desc" }],
      take: 200,
    }),
    prisma.reservation.findMany({
      where: { kind: "BOOKING", status: "PENDING_PAYMENT" },
      include: {
        user: true,
        bookings: { include: { resource: true }, orderBy: [{ date: "asc" }, { startHour: "asc" }] },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Group pending-payment reservations by user for the confirm-payment panel.
  const pendingByUser = Array.from(
    pendingRows
      .reduce((m, r) => {
        const g = m.get(r.userId) ?? { user: r.user, reservations: [] as typeof pendingRows };
        g.reservations.push(r);
        m.set(r.userId, g);
        return m;
      }, new Map<string, { user: (typeof pendingRows)[number]["user"]; reservations: typeof pendingRows }>())
      .values()
  );

  const policy = await getBookingPolicy();
  // Refund the policy would give right now (guides the admin; they can override).
  const policyRefund = (b: { date: string; startHour: number; totalCents: number; refundedCents: number }) =>
    Math.round((Math.max(0, b.totalCents - b.refundedCents) * refundPercentForPolicy(hoursUntilStart(b.date, b.startHour), policy)) / 100);

  const maxDate = (dates: string[]) => (dates.length ? dates.slice().sort().at(-1)! : "");
  const inFilter = (d: string) =>
    filter === "all" || (filter === "upcoming" ? d >= now.date : d < now.date);

  const reservations: WorkbenchReservation[] = reservationRows
    .filter((r) => inFilter(maxDate(r.bookings.map((b) => b.date))))
    .map((r) => ({
      id: r.id,
      label: r.label,
      userName: r.user.name,
      userEmail: r.user.email,
      status: r.status,
      totalCents: r.totalCents,
      refundedCents: r.refundedCents,
      segments: r.bookings.map((b) => ({
        id: b.id,
        resourceName: b.resource.name,
        date: b.date,
        startHour: b.startHour,
        endHour: b.endHour,
        status: b.status,
        totalCents: b.totalCents,
        refundedCents: b.refundedCents,
        noShow: b.noShow,
        paid: b.paymentRef != null,
        policyRefundCents: policyRefund(b),
      })),
    }));

  const standalone: WorkbenchStandalone[] = standaloneRows
    .filter((b) => inFilter(b.date))
    .map((b) => ({
      id: b.id,
      resourceName: b.resource.name,
      date: b.date,
      startHour: b.startHour,
      endHour: b.endHour,
      status: b.status,
      totalCents: b.totalCents,
      refundedCents: b.refundedCents,
      noShow: b.noShow,
      paid: b.paymentRef != null,
      policyRefundCents: policyRefund(b),
      userName: `${b.user.name} · ${b.user.email}`,
    }));

  const filterLink = (f: Filter, label: string) => (
    <Link
      href={`/admin/bookings?filter=${f}`}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        filter === f ? "gradient-brand text-white" : "bg-navy/5 text-navy hover:bg-navy/10"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-4xl text-navy">Bookings</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/bookings/bulk" className="rounded-md border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5">
            Bulk upload (Excel)
          </Link>
          <Link href="/admin/bookings/new" className="btn-brand rounded-md px-4 py-2 text-sm font-bold uppercase">
            + New booking
          </Link>
        </div>
      </div>
      <p className="mt-2 text-sm text-navy/60">
        Reschedule, mark no-shows, or refund. Tick reservations / day-segments then
        review to refund — with a reason and confirmation (partial, refund-only, or
        cancel-only all supported).
      </p>

      <div className="mt-4 flex items-center gap-2">
        {filterLink("all", "All")}
        {filterLink("upcoming", "Upcoming")}
        {filterLink("past", "Past")}
      </div>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {/* Awaiting Zelle payment — confirm once the transfer is received */}
      {pendingByUser.length > 0 && (
        <section className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-5">
          <h2 className="display text-2xl text-navy">
            Awaiting Zelle payment ({pendingRows.length})
          </h2>
          <p className="mt-1 text-sm text-navy/70">
            Match the Zelle memo to the Reservation ID, then confirm. Confirming emails the customer a
            payment confirmation. Grouped by user — confirm one or all of a user&apos;s reservations.
          </p>
          <div className="mt-4 space-y-4">
            {pendingByUser.map(({ user, reservations: userRes }) => (
              <div key={user.id} className="rounded-xl border border-navy/10 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-navy">
                    {user.name} <span className="font-normal text-navy/50">· {user.email}</span>
                  </span>
                  <form action={confirmAllForUser}>
                    <input type="hidden" name="userId" value={user.id} />
                    <button className="rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-bold uppercase text-green-700 hover:bg-green-100">
                      Confirm all ({userRes.length})
                    </button>
                  </form>
                </div>
                <ul className="mt-2 space-y-2">
                  {userRes.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-navy/5 pt-2 text-sm">
                      <span>
                        <span className="font-mono font-bold text-navy">{r.code ?? r.id.slice(-6)}</span>
                        {r.label ? <span className="text-navy/70"> · {r.label}</span> : ""}
                        <span className="ml-1 font-semibold text-navy">· {formatCents(r.totalCents)}</span>
                        <span className="block text-xs text-navy/60">
                          {r.bookings.map((b) => `${b.resource.name} ${b.date} ${b.startHour}:00–${b.endHour}:00`).join(" · ")}
                        </span>
                      </span>
                      <div className="flex items-center gap-2">
                        <form action={confirmReservationPayment}>
                          <input type="hidden" name="reservationId" value={r.id} />
                          <button className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-green-700">
                            Confirm payment
                          </button>
                        </form>
                        <form action={rejectReservationPayment}>
                          <input type="hidden" name="reservationId" value={r.id} />
                          <button className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-bold uppercase text-red-600 hover:bg-red-50">
                            Reject
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6">
        <RefundWorkbench
          reservations={reservations}
          standalone={standalone}
          action={bulkRefund}
          returnTo={`/admin/bookings?filter=${filter}`}
          noShowAction={toggleNoShow}
        />
      </div>
    </div>
  );
}
