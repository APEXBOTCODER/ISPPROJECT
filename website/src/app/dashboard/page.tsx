import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { parkNow } from "@/lib/availability";
import { getCurrentWaiver } from "@/lib/waiver";
import { getBookingPolicy } from "@/lib/policy";
import { cancelBooking, cancelReservation, logoutAction } from "./actions";
import { emailSignedWaiver } from "@/app/waiver/actions";

export const metadata = { title: "My Account" };
export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  CONFIRMED: "bg-green-50 text-green-700 ring-green-200",
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  PENDING_PAYMENT: "bg-amber-50 text-amber-700 ring-amber-200",
  CANCELLED: "bg-navy/5 text-navy/50 ring-navy/10",
};
const statusLabel = (s: string) => (s === "PENDING_PAYMENT" ? "Pending payment" : s);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cancelled?: string; waiverEmailed?: string }>;
}) {
  const user = await requireUser();
  const { error, cancelled, waiverEmailed } = await searchParams;
  const now = parkNow();

  const [bookings, signatures, currentWaiver, dbUser, policy] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: user.id, status: { not: "BLOCKED" } },
      include: { resource: true },
      orderBy: [{ date: "desc" }, { startHour: "desc" }],
      take: 50,
    }),
    prisma.waiverSignature.findMany({
      where: { userId: user.id },
      orderBy: { signedAt: "desc" },
    }),
    getCurrentWaiver(),
    prisma.user.findUnique({ where: { id: user.id } }),
    getBookingPolicy(),
  ]);

  const upcoming = bookings.filter(
    (b) =>
      b.status !== "CANCELLED" &&
      (b.date > now.date || (b.date === now.date && b.endHour > now.hour))
  );
  const past = bookings.filter((b) => !upcoming.includes(b));
  // A signature counts only if it's for the current version AND was made after
  // any staff-issued "re-sign required" flag on the account.
  const resignAt = dbUser?.waiverResignRequiredAt ?? null;
  const waiverCurrent = signatures.some(
    (s) => s.version === currentWaiver?.version && (!resignAt || s.signedAt >= resignAt)
  );

  // Group upcoming bookings that belong to a multi-day reservation; standalone
  // bookings (reservationId null) render individually.
  type BookingRow = (typeof upcoming)[number];
  const reservationGroups = new Map<string, BookingRow[]>();
  const singleBookings: BookingRow[] = [];
  for (const b of upcoming) {
    if (b.reservationId) {
      const arr = reservationGroups.get(b.reservationId) ?? [];
      arr.push(b);
      reservationGroups.set(b.reservationId, arr);
    } else {
      singleBookings.push(b);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display text-4xl text-navy">My Account</h1>
          <p className="mt-1 text-navy/70">
            {dbUser?.name} · {dbUser?.email}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/book" className="btn-brand rounded-md px-4 py-2 text-sm uppercase">
            Book a field
          </Link>
          <form action={logoutAction}>
            <button className="rounded-md border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5">
              Log out
            </button>
          </form>
        </div>
      </div>

      {cancelled && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">
          Booking cancelled. Any refund per policy has been processed — check your email.
        </p>
      )}
      {waiverEmailed && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">
          Your signed waiver PDF has been emailed to you.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {!waiverCurrent && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-300">
          <span>
            <strong>Waiver signature required.</strong> You must sign the current liability waiver
            {currentWaiver ? ` (v${currentWaiver.version})` : ""} before making another reservation.
          </span>
          <Link href="/waiver?next=/dashboard" className="btn-brand rounded-md px-4 py-2 text-xs font-bold uppercase">
            Sign waiver now
          </Link>
        </div>
      )}

      {/* Verification status */}
      <section className="mt-8 rounded-2xl border border-navy/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="display text-xl text-navy">Account verification</h2>
            <p className="mt-1 text-sm text-navy/60">
              Email:{" "}
              {dbUser?.emailVerified ? (
                <span className="font-semibold text-green-700">✓ verified</span>
              ) : (
                <span className="font-semibold text-amber-700">not verified — required for booking</span>
              )}
              {" · "}Phone:{" "}
              {dbUser?.phoneVerified ? (
                <span className="font-semibold text-green-700">✓ verified</span>
              ) : (
                <span className="text-navy/60">not verified (optional)</span>
              )}
            </p>
          </div>
          {(!dbUser?.emailVerified || !dbUser?.phoneVerified) && (
            <Link
              href="/verify?next=/dashboard"
              className="rounded-md border border-navy/20 px-4 py-2 text-sm font-semibold text-navy hover:bg-navy/5"
            >
              Verify now
            </Link>
          )}
        </div>
      </section>

      {/* Waiver status */}
      <section
        className={`mt-8 rounded-2xl border p-5 ${
          waiverCurrent ? "border-navy/10" : "border-amber-300 bg-amber-50/60"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="display text-xl text-navy">
              Liability waiver
              {!waiverCurrent && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold text-amber-800 ring-1 ring-amber-300">
                  Signature required
                </span>
              )}
            </h2>
            <p className="mt-1 text-sm text-navy/60">
              {waiverCurrent
                ? `Signed — current version (v${currentWaiver?.version}).`
                : "You must sign the current liability waiver before making another reservation."}
            </p>
          </div>
          {!waiverCurrent && (
            <Link href="/waiver?next=/dashboard" className="btn-brand rounded-md px-4 py-2 text-sm uppercase">
              Sign waiver
            </Link>
          )}
        </div>
        {signatures.length > 0 && (
          <ul className="mt-3 space-y-2 text-xs text-navy/60">
            {signatures.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy/[0.03] px-3 py-2">
                <span>
                  v{s.version} · {s.participantName}
                  {s.guardianRelation ? ` (minor — signed by ${s.signedName})` : ""} ·{" "}
                  {s.signedAt.toISOString().slice(0, 10)}
                  {s.emailedAt && (
                    <span className="ml-1 text-navy/40">· emailed {s.emailedAt.toISOString().slice(0, 10)}</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <a href={`/api/waiver/pdf/${s.id}`} className="font-semibold text-sky hover:underline">
                    Download PDF
                  </a>
                  <form action={emailSignedWaiver}>
                    <input type="hidden" name="signatureId" value={s.id} />
                    <input type="hidden" name="returnTo" value="/dashboard" />
                    <button className="font-semibold text-sky hover:underline">Email me a copy</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Upcoming */}
      <section className="mt-8">
        <h2 className="display text-2xl text-navy">Upcoming bookings</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-navy/60">
            Nothing booked yet.{" "}
            <Link href="/book" className="font-semibold text-sky hover:underline">
              Grab a field →
            </Link>
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Multi-day reservations */}
            {Array.from(reservationGroups.entries()).map(([reservationId, group]) => {
              const multi = group.length > 1;
              const hasActive = group.some((b) => b.status === "CONFIRMED");
              return (
                <div key={reservationId} className="rounded-xl border border-navy/10 p-4">
                  {multi && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-navy/10 pb-2">
                      <span className="text-sm font-semibold text-navy">
                        Reservation · {group.length} sessions
                      </span>
                      {hasActive && (
                        <form action={cancelReservation}>
                          <input type="hidden" name="reservationId" value={reservationId} />
                          <button className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                            Cancel entire reservation
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                  <ul className="space-y-2">
                    {group.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-navy">{b.resource.name}</div>
                          <div className="text-sm text-navy/60">
                            {b.date} · {b.startHour}:00–{b.endHour}:00 (US Central) ·{" "}
                            {formatCents(b.totalCents)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[b.status] ?? statusStyles.CANCELLED}`}>
                            {statusLabel(b.status)}
                          </span>
                          {b.status === "CONFIRMED" && (
                            <form action={cancelBooking}>
                              <input type="hidden" name="bookingId" value={b.id} />
                              <button className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                                Cancel
                              </button>
                            </form>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {/* Standalone bookings */}
            {singleBookings.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy/10 p-4"
              >
                <div>
                  <div className="font-bold text-navy">{b.resource.name}</div>
                  <div className="text-sm text-navy/60">
                    {b.date} · {b.startHour}:00–{b.endHour}:00 (US Central) ·{" "}
                    {formatCents(b.totalCents)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[b.status] ?? statusStyles.CANCELLED}`}>
                    {statusLabel(b.status)}
                  </span>
                  {b.status === "CONFIRMED" && (
                    <form action={cancelBooking}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <button className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                        Cancel
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-navy/50">
          Cancellation policy: full refund {policy.fullRefundHours}+ hours ahead,
          50% refund {policy.halfRefundHours}–{policy.fullRefundHours} hours,
          no refund inside {policy.halfRefundHours} hours.
        </p>
      </section>

      {/* Past */}
      <section className="mt-10">
        <h2 className="display text-2xl text-navy">History</h2>
        {past.length === 0 ? (
          <p className="mt-3 text-sm text-navy/60">No past bookings yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {past.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy/[0.03] px-4 py-3 text-sm"
              >
                <span className="text-navy/80">
                  {b.resource.name} · {b.date} · {b.startHour}:00–{b.endHour}:00
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-navy/60">{formatCents(b.totalCents)}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusStyles[b.status] ?? statusStyles.CANCELLED}`}
                  >
                    {statusLabel(b.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
