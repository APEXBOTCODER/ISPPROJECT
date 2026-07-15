import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { userRefundCapCents } from "@/lib/reservations";
import RefundWorkbench, {
  type WorkbenchReservation,
  type WorkbenchStandalone,
} from "@/components/RefundWorkbench";
import CustomRefundForm from "@/components/CustomRefundForm";
import UserSearch from "@/components/UserSearch";
import { bulkRefund, customRefund } from "./actions";

export const metadata = { title: "Admin · Refunds" };
export const dynamic = "force-dynamic";

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; ok?: string; error?: string }>;
}) {
  await requireStaff();
  const { userId, ok, error } = await searchParams;

  const refundHistory = await prisma.refundRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { user: true, staff: true },
  });

  // Selected user's reservations for the by-user workbench.
  let reservations: WorkbenchReservation[] = [];
  let standalone: WorkbenchStandalone[] = [];
  let capCents: number | undefined;
  let selectedUser: { id: string; name: string; email: string } | null = null;
  if (userId) {
    const [user, resRows, singleRows, cap] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }),
      prisma.reservation.findMany({
        where: { kind: "BOOKING", userId },
        include: {
          user: true,
          bookings: { include: { resource: true }, orderBy: [{ date: "asc" }, { startHour: "asc" }] },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.findMany({
        where: { userId, reservationId: null, status: { not: "BLOCKED" } },
        include: { user: true, resource: true },
        orderBy: [{ date: "desc" }, { startHour: "desc" }],
      }),
      userRefundCapCents(userId),
    ]);
    selectedUser = user;
    capCents = cap;
    reservations = resRows.map((r) => ({
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
      })),
    }));
    standalone = singleRows.map((b) => ({
      id: b.id,
      resourceName: b.resource.name,
      date: b.date,
      startHour: b.startHour,
      endHour: b.endHour,
      status: b.status,
      totalCents: b.totalCents,
      refundedCents: b.refundedCents,
    }));
  }

  return (
    <div>
      <h1 className="display text-4xl text-navy">Refunds</h1>
      <p className="mt-2 text-sm text-navy/60">
        Refund by user, issue a custom amount, or use the full bookings workbench.
      </p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {/* Refund by user */}
      <section className="mt-8 rounded-2xl border border-navy/10 p-5">
        <h2 className="display text-2xl text-navy">Refund by user</h2>
        <p className="mt-1 text-sm text-navy/60">
          Search a customer by name or email, then select what to refund.
        </p>
        <div className="mt-3 max-w-md">
          <UserSearch
            redirectBase="/admin/refunds?userId="
            placeholder="Search customer by name or email…"
            initialLabel={selectedUser ? `${selectedUser.name} · ${selectedUser.email}` : undefined}
          />
        </div>

        {userId && selectedUser && (
          <div className="mt-5">
            <p className="text-sm text-navy/70">
              <strong>{selectedUser.name}</strong> · refundable balance{" "}
              <strong>{formatCents(capCents ?? 0)}</strong>
            </p>
            {reservations.length === 0 && standalone.length === 0 ? (
              <p className="mt-3 text-sm text-navy/60">This customer has no bookings.</p>
            ) : (
              <div className="mt-3">
                <RefundWorkbench
                  reservations={reservations}
                  standalone={standalone}
                  action={bulkRefund}
                  returnTo={`/admin/refunds?userId=${userId}`}
                />
              </div>
            )}
          </div>
        )}
        {userId && !selectedUser && (
          <p className="mt-3 text-sm text-red-600">That customer could not be found.</p>
        )}
      </section>

      {/* Custom refund */}
      <section className="mt-8 rounded-2xl border border-navy/10 p-5">
        <h2 className="display text-2xl text-navy">Custom refund</h2>
        <p className="mt-1 text-sm text-navy/60">
          Refund an arbitrary amount to a customer (goodwill / partial adjustment)
          without cancelling any booking. Capped at what they&apos;ve net-paid.
        </p>
        <div className="max-w-md">
          <CustomRefundForm action={customRefund} defaultUser={selectedUser} capCents={capCents} />
        </div>
      </section>

      {/* Refund history / audit log */}
      <section className="mt-8">
        <h2 className="display text-2xl text-navy">Refund history</h2>
        {refundHistory.length === 0 ? (
          <p className="mt-3 text-sm text-navy/60">No refunds yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase text-navy/50">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Scope</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Cancelled?</th>
                  <th className="py-2 pr-4">By</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {refundHistory.map((r) => (
                  <tr key={r.id} className="border-b border-navy/5 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap text-navy/60">
                      {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="py-2 pr-4">{r.user.name}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full bg-navy/5 px-2 py-0.5 text-xs font-semibold text-navy/70">
                        {r.scope}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-semibold text-navy">{formatCents(r.amountCents)}</td>
                    <td className="py-2 pr-4">{r.cancelled ? "Yes" : "No"}</td>
                    <td className="py-2 pr-4 text-navy/60">{r.staff.name}</td>
                    <td className="py-2 text-navy/70">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
