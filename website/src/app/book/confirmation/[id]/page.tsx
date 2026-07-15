import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";

export const metadata = { title: "Booking confirmed" };

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      bookings: {
        include: { resource: true },
        orderBy: [{ date: "asc" }, { startHour: "asc" }],
      },
    },
  });
  // Ownership check — users can only view their own confirmations
  if (!reservation || reservation.userId !== session.user.id) notFound();

  const multi = reservation.bookings.length > 1;

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full gradient-brand text-3xl text-white">
        ✓
      </div>
      <h1 className="display mt-6 text-4xl text-navy">
        {reservation.status === "CONFIRMED"
          ? multi
            ? "Reservation confirmed!"
            : "You're booked!"
          : `Reservation ${reservation.status.toLowerCase()}`}
      </h1>
      <p className="mt-2 text-navy/70">
        A confirmation email has been sent. See you on the field!
      </p>

      <div className="mx-auto mt-8 max-w-sm space-y-3 rounded-2xl border border-navy/10 p-6 text-left text-sm">
        {reservation.label && (
          <div className="flex justify-between">
            <dt className="text-navy/60">Organization</dt>
            <dd className="font-semibold text-navy">{reservation.label}</dd>
          </div>
        )}
        <ul className="space-y-2">
          {reservation.bookings.map((b) => (
            <li key={b.id} className="flex items-start justify-between gap-3 border-b border-navy/5 pb-2 last:border-0">
              <span>
                <span className="block font-semibold text-navy">{b.resource.name}</span>
                <span className="block text-navy/60">
                  {b.date} · {b.startHour}:00–{b.endHour}:00
                </span>
              </span>
              <span className="font-semibold text-navy">{formatCents(b.totalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-navy/10 pt-2">
          <dt className="font-semibold text-navy">Total paid</dt>
          <dd className="font-bold text-navy">{formatCents(reservation.totalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-navy/60">Reference</dt>
          <dd className="font-mono text-xs text-navy">{reservation.paymentRef}</dd>
        </div>
      </div>

      {reservation.paymentRef?.startsWith("MOCK-") && (
        <p className="mt-4 text-xs text-navy/50">
          Test mode — this was a simulated payment; no card was charged.
        </p>
      )}

      <div className="mt-8 flex justify-center gap-3">
        <Link href="/dashboard" className="btn-brand rounded-md px-5 py-2.5 text-sm uppercase">
          My bookings
        </Link>
        <Link
          href="/book"
          className="rounded-md border border-navy/20 px-5 py-2.5 text-sm font-semibold text-navy hover:bg-navy/5"
        >
          Book another
        </Link>
      </div>
    </div>
  );
}
