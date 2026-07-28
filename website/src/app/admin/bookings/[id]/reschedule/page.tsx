import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parkNow } from "@/lib/availability";
import { getBookingPolicy } from "@/lib/policy";
import RescheduleForm from "@/components/RescheduleForm";
import { rescheduleBooking } from "../../actions";

export const metadata = { title: "Admin · Reschedule" };
export const dynamic = "force-dynamic";

export default async function ReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const { error } = await searchParams;

  const [booking, resources] = await Promise.all([
    prisma.booking.findUnique({ where: { id }, include: { resource: true, user: true } }),
    prisma.resource.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, openHour: true, closeHour: true, baseRate: true, peakRate: true },
    }),
  ]);
  if (!booking) notFound();

  const now = parkNow();
  const duration = booking.endHour - booking.startHour;
  const policy = await getBookingPolicy();
  const rescheduleMax = (() => {
    const d = new Date(`${now.date}T00:00:00`);
    d.setDate(d.getDate() + policy.advanceBookingDays);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between gap-2">
        <h1 className="display text-4xl text-navy">Reschedule</h1>
        <Link href="/admin/bookings" className="text-sm font-semibold text-sky hover:underline">
          ← Bookings
        </Link>
      </div>

      <div className="mt-4 rounded-2xl border border-navy/10 p-4 text-sm">
        <div className="font-semibold text-navy">{booking.resource.name}</div>
        <div className="text-navy/60">
          Currently: {booking.date} · {booking.startHour}:00–{booking.endHour}:00 ({duration}h) · {booking.user.name}
        </div>
        {booking.status !== "CONFIRMED" && (
          <p className="mt-2 text-red-600">Only confirmed bookings can be rescheduled.</p>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {booking.status === "CONFIRMED" && (
        <RescheduleForm
          action={rescheduleBooking}
          booking={{
            id: booking.id,
            resourceId: booking.resourceId,
            date: booking.date,
            startHour: booking.startHour,
            endHour: booking.endHour,
            outstandingCents: Math.max(0, booking.totalCents - booking.refundedCents),
          }}
          resources={resources}
          minDate={now.date}
          maxDate={rescheduleMax}
        />
      )}
    </div>
  );
}
