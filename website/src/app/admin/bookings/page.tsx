import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parkNow } from "@/lib/availability";
import RefundWorkbench, {
  type WorkbenchReservation,
  type WorkbenchStandalone,
} from "@/components/RefundWorkbench";
import { bulkRefund } from "@/app/admin/refunds/actions";
import { toggleNoShow } from "./actions";

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

  const [reservationRows, standaloneRows] = await Promise.all([
    prisma.reservation.findMany({
      where: { kind: "BOOKING" },
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
  ]);

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
