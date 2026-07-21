import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { getBookingPolicy } from "@/lib/policy";

export const metadata = { title: "Reservation received" };

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const [reservation, settings, policy] = await Promise.all([
    prisma.reservation.findUnique({
      where: { id },
      include: {
        bookings: { include: { resource: true }, orderBy: [{ date: "asc" }, { startHour: "asc" }] },
      },
    }),
    getSettings(),
    getBookingPolicy(),
  ]);
  if (!reservation || reservation.userId !== session.user.id) notFound();
  const expiryLabel = policy.unpaidExpiryHours === 1 ? "1 hour" : `${policy.unpaidExpiryHours} hours`;

  const pending = reservation.status === "PENDING_PAYMENT";
  const confirmed = reservation.status === "CONFIRMED";
  const zelleEmail = settings["payment.zelleEmail"];
  const zelleName = settings["payment.zelleName"];

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <div className="text-center">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white ${
            confirmed ? "gradient-brand" : "bg-amber-500"
          }`}
        >
          {confirmed ? "✓" : "⏳"}
        </div>
        <h1 className="display mt-6 text-4xl text-navy">
          {confirmed ? "You're booked!" : "Reservation received"}
        </h1>
        {pending && reservation.code && (
          <p className="mt-3 text-navy/70">
            Reservation ID:{" "}
            <span className="rounded-md bg-navy px-2 py-1 font-mono text-lg font-bold tracking-wider text-white">
              {reservation.code}
            </span>
          </p>
        )}
      </div>

      {/* Slots + amount */}
      <div className="mx-auto mt-8 max-w-md space-y-3 rounded-2xl border border-navy/10 p-6 text-left text-sm">
        {reservation.label && (
          <div className="flex justify-between">
            <span className="text-navy/60">Organization</span>
            <span className="font-semibold text-navy">{reservation.label}</span>
          </div>
        )}
        <ul className="space-y-2">
          {reservation.bookings.map((b) => (
            <li key={b.id} className="flex items-start justify-between gap-3 border-b border-navy/5 pb-2 last:border-0">
              <span>
                <span className="block font-semibold text-navy">{b.resource.name}</span>
                <span className="block text-navy/60">{b.date} · {b.startHour}:00–{b.endHour}:00</span>
              </span>
              <span className="font-semibold text-navy">{formatCents(b.totalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-navy/10 pt-2 text-base">
          <span className="font-semibold text-navy">{confirmed ? "Total paid" : "Amount due"}</span>
          <span className="font-bold text-navy">{formatCents(reservation.totalCents)}</span>
        </div>
        {reservation.discountCents > 0 && (
          <p className="text-right text-xs font-semibold text-pitch-deep">
            Includes {reservation.discountCode} discount −{formatCents(reservation.discountCents)}
          </p>
        )}
      </div>

      {pending && (
        <div className="mx-auto mt-6 max-w-md rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-6 text-sm">
          <p className="font-bold text-amber-900">Pending payment verification</p>
          <p className="mt-2 text-navy/80">
            Pay <strong>{formatCents(reservation.totalCents)}</strong> by <strong>Zelle</strong> to:
          </p>
          <div className="mt-2 rounded-lg bg-white p-3">
            <div className="flex justify-between"><span className="text-navy/60">Zelle email</span><span className="font-semibold text-navy">{zelleEmail}</span></div>
            <div className="flex justify-between"><span className="text-navy/60">Zelle name</span><span className="font-semibold text-navy">{zelleName}</span></div>
            <div className="flex justify-between"><span className="text-navy/60">Memo</span><span className="font-mono font-bold text-navy">{reservation.code}</span></div>
          </div>
          <p className="mt-2 text-xs text-navy/70">
            Put your Reservation ID <strong>{reservation.code}</strong> in the Zelle memo so we can match your payment.
            Once we receive it, your reservation is confirmed and you&apos;ll get a confirmation email. We&apos;ve
            emailed you these details too. Unpaid requests are automatically cleared in {expiryLabel}.
          </p>
        </div>
      )}

      <div className="mt-8 flex justify-center gap-3">
        <Link href="/dashboard" className="btn-brand rounded-md px-5 py-2.5 text-sm uppercase">My bookings</Link>
        <Link href="/book" className="rounded-md border border-navy/20 px-5 py-2.5 text-sm font-semibold text-navy hover:bg-navy/5">Book another</Link>
      </div>
    </div>
  );
}
