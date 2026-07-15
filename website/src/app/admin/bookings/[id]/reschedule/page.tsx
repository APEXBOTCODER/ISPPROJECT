import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { parkNow } from "@/lib/availability";
import { getBookingPolicy } from "@/lib/policy";
import SingleDayPicker from "@/components/SingleDayPicker";
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

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { resource: true, user: true },
  });
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
        <form action={rescheduleBooking} className="mt-5 space-y-4 rounded-2xl border border-navy/10 p-5">
          <input type="hidden" name="bookingId" value={booking.id} />
          <p className="text-xs text-navy/60">
            Moves this {duration}-hour session to a new date/time on the same facility,
            keeping the same price. Must be a free slot within the booking window.
          </p>
          <div>
            <span className="block text-sm font-medium text-navy">New date</span>
            <div className="mt-1">
              <SingleDayPicker name="date" defaultValue={booking.date} minDate={now.date} maxDate={rescheduleMax} />
            </div>
          </div>
          <label className="block text-sm font-medium text-navy">
            New start hour
            <select name="startHour" defaultValue={booking.startHour} className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm">
              {Array.from({ length: booking.resource.closeHour - duration - booking.resource.openHour + 1 }, (_, i) => booking.resource.openHour + i).map((h) => (
                <option key={h} value={h}>{h}:00 – {h + duration}:00</option>
              ))}
            </select>
          </label>
          <button className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase">
            Reschedule
          </button>
        </form>
      )}
    </div>
  );
}
