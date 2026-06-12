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
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { resource: true },
  });
  // Ownership check — users can only view their own confirmations
  if (!booking || booking.userId !== session.user.id) notFound();

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full gradient-brand text-3xl text-white">
        ✓
      </div>
      <h1 className="display mt-6 text-4xl text-navy">
        {booking.status === "CONFIRMED" ? "You're booked!" : `Booking ${booking.status.toLowerCase()}`}
      </h1>
      <p className="mt-2 text-navy/70">
        A confirmation email has been sent. See you on the field!
      </p>

      <dl className="mx-auto mt-8 max-w-sm space-y-3 rounded-2xl border border-navy/10 p-6 text-left text-sm">
        <div className="flex justify-between">
          <dt className="text-navy/60">Facility</dt>
          <dd className="font-semibold text-navy">{booking.resource.name}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-navy/60">Date</dt>
          <dd className="font-semibold text-navy">{booking.date}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-navy/60">Time</dt>
          <dd className="font-semibold text-navy">
            {booking.startHour}:00 – {booking.endHour}:00 (US Central)
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-navy/60">Total paid</dt>
          <dd className="font-semibold text-navy">{formatCents(booking.totalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-navy/60">Reference</dt>
          <dd className="font-mono text-xs text-navy">{booking.paymentRef}</dd>
        </div>
      </dl>

      {booking.paymentRef?.startsWith("MOCK-") && (
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
