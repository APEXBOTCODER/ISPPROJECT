import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { userRefundCapCents } from "@/lib/reservations";
import { setUserRole, setManualVerified, setUserActive } from "../actions";

export const metadata = { title: "Admin · User" };
export const dynamic = "force-dynamic";

const ROLES = ["CUSTOMER", "STAFF", "ADMIN"] as const;

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  const { ok, error } = await searchParams;

  const [user, reservations, standalone, refunds, cap] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    prisma.reservation.findMany({
      where: { kind: "BOOKING", userId: id },
      include: { bookings: { include: { resource: true }, orderBy: [{ date: "asc" }] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.booking.findMany({
      where: { userId: id, reservationId: null, status: { not: "BLOCKED" } },
      include: { resource: true },
      orderBy: [{ date: "desc" }],
      take: 50,
    }),
    prisma.refundRecord.findMany({
      where: { userId: id },
      include: { staff: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    userRefundCapCents(id),
  ]);

  if (!user) notFound();

  const isAdmin = staff.role === "ADMIN";
  const isSelf = staff.id === user.id;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="display text-4xl text-navy">{user.name}</h1>
        <Link href="/admin/users" className="text-sm font-semibold text-sky hover:underline">
          ← All users
        </Link>
      </div>
      <p className="mt-1 text-sm text-navy/60">
        {user.email}
        {user.phone ? ` · ${user.phone}` : ""} · joined {user.createdAt.toISOString().slice(0, 10)}
      </p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {!user.active && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          This account is deactivated — the user cannot sign in or book. Reactivate below to restore access.
        </p>
      )}

      {/* Profile / role / verification / status */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-navy/10 p-4">
          <div className="text-xs uppercase tracking-wide text-navy/50">Role</div>
          <div className="mt-1 text-lg font-bold text-navy">{user.role}</div>
          {isAdmin && !isSelf && (
            <form action={setUserRole} className="mt-2 flex gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <select name="role" defaultValue={user.role} className="rounded-md border border-navy/20 px-2 py-1 text-sm">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <button className="rounded-md border border-navy/20 px-3 py-1 text-xs font-semibold text-navy hover:bg-navy/5">
                Save
              </button>
            </form>
          )}
          {isSelf && <p className="mt-2 text-xs text-navy/50">You can&apos;t change your own role.</p>}
          {!isAdmin && !isSelf && <p className="mt-2 text-xs text-navy/50">Admin-only.</p>}
        </div>

        <div className="rounded-2xl border border-navy/10 p-4">
          <div className="text-xs uppercase tracking-wide text-navy/50">Email verification</div>
          <div className="mt-1 text-lg font-bold text-navy">
            {user.emailVerified ? "✓ Verified" : "Not verified"}
          </div>
          {isAdmin && (
            <form action={setManualVerified} className="mt-2">
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="verified" value={user.emailVerified ? "false" : "true"} />
              <button className="rounded-md border border-navy/20 px-3 py-1 text-xs font-semibold text-navy hover:bg-navy/5">
                {user.emailVerified ? "Clear verification" : "Mark verified"}
              </button>
            </form>
          )}
        </div>

        <div className="rounded-2xl border border-navy/10 p-4">
          <div className="text-xs uppercase tracking-wide text-navy/50">Refundable balance</div>
          <div className="mt-1 text-lg font-bold text-navy">{formatCents(cap)}</div>
          <Link href={`/admin/refunds?userId=${user.id}`} className="mt-2 inline-block text-xs font-semibold text-sky hover:underline">
            Refund this user →
          </Link>
        </div>

        <div className="rounded-2xl border border-navy/10 p-4">
          <div className="text-xs uppercase tracking-wide text-navy/50">Account status</div>
          <div className={`mt-1 text-lg font-bold ${user.active ? "text-navy" : "text-red-600"}`}>
            {user.active ? "Active" : "Deactivated"}
          </div>
          {isAdmin && !(isSelf && user.active) ? (
            <form action={setUserActive} className="mt-2">
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="active" value={user.active ? "false" : "true"} />
              <button
                className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                  user.active
                    ? "border-red-200 text-red-600 hover:bg-red-50"
                    : "border-green-200 text-green-700 hover:bg-green-50"
                }`}
              >
                {user.active ? "Deactivate account" : "Reactivate account"}
              </button>
            </form>
          ) : isSelf ? (
            <p className="mt-2 text-xs text-navy/50">You can&apos;t deactivate yourself.</p>
          ) : (
            <p className="mt-2 text-xs text-navy/50">Admin-only.</p>
          )}
        </div>
      </section>

      {/* Reservations */}
      <section className="mt-8">
        <h2 className="display text-2xl text-navy">Reservations</h2>
        {reservations.length === 0 ? (
          <p className="mt-2 text-sm text-navy/60">No reservations.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reservations.map((r) => (
              <li key={r.id} className="rounded-xl border border-navy/10 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-navy">{r.label || "Reservation"} · {formatCents(r.totalCents)}</span>
                  <span className="text-xs text-navy/50">
                    {r.status}{r.refundedCents > 0 ? ` · refunded ${formatCents(r.refundedCents)}` : ""}
                  </span>
                </div>
                <ul className="mt-2 space-y-1 text-navy/70">
                  {r.bookings.map((b) => (
                    <li key={b.id}>
                      {b.resource.name} · {b.date} · {b.startHour}:00–{b.endHour}:00 · {formatCents(b.totalCents)}
                      {" · "}{b.status}{b.noShow ? " · NO-SHOW" : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {standalone.length > 0 && (
        <section className="mt-6">
          <h2 className="display text-2xl text-navy">Individual bookings</h2>
          <ul className="mt-3 space-y-1 text-sm text-navy/70">
            {standalone.map((b) => (
              <li key={b.id}>
                {b.resource.name} · {b.date} · {b.startHour}:00–{b.endHour}:00 · {formatCents(b.totalCents)} · {b.status}
                {b.noShow ? " · NO-SHOW" : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Refund history */}
      <section className="mt-8">
        <h2 className="display text-2xl text-navy">Refund history</h2>
        {refunds.length === 0 ? (
          <p className="mt-2 text-sm text-navy/60">No refunds.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-navy/70">
            {refunds.map((r) => (
              <li key={r.id}>
                {r.createdAt.toISOString().slice(0, 10)} · {r.scope} · {formatCents(r.amountCents)}
                {r.cancelled ? " · cancelled" : ""} · by {r.staff.name} · {r.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
