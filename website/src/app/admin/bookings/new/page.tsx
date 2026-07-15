import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getBookingPolicy } from "@/lib/policy";
import AdminBookingForm from "@/components/AdminBookingForm";
import { createAdminReservation } from "../actions";

export const metadata = { title: "Admin · New booking" };
export const dynamic = "force-dynamic";

export default async function AdminNewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireStaff();
  const { error } = await searchParams;

  const [resources, policy] = await Promise.all([
    prisma.resource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getBookingPolicy(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h1 className="display text-4xl text-navy">New booking</h1>
        <Link href="/admin/bookings" className="text-sm font-semibold text-sky hover:underline">
          ← Bookings
        </Link>
      </div>
      <p className="mt-2 text-sm text-navy/60">
        Book on behalf of a walk-in or phone customer. Confirmed instantly as a comp
        booking (no payment charged); a confirmation email is sent.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      <div className="mt-6">
        <AdminBookingForm
          resources={resources}
          action={createAdminReservation}
          maxAdvanceDays={policy.advanceBookingDays}
          maxHoursPerSegment={policy.maxHoursPerSegment}
          maxSegmentsPerReservation={policy.maxSegmentsPerReservation}
        />
      </div>
    </div>
  );
}
