import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { hasCurrentWaiver } from "@/lib/waiver";
import { hasVerifiedEmail } from "@/lib/verification";
import { getBookingPolicy } from "@/lib/policy";
import BookingWizard from "@/components/BookingWizard";
import { createReservation } from "./actions";
import Link from "next/link";

export const metadata = { title: "Book a Field" };
export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [resources, waiverSigned, emailVerified, policy] = await Promise.all([
    prisma.resource.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    hasCurrentWaiver(session.user.id),
    hasVerifiedEmail(session.user.id),
    getBookingPolicy(),
  ]);
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="display text-4xl text-navy sm:text-5xl">
        Book a <span className="gradient-text">Field</span>
      </h1>
      <p className="mt-2 text-navy/70">
        Real-time availability · hourly slots · instant confirmation.
      </p>

      {!emailVerified && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Please verify your email before booking.{" "}
          <Link href="/verify?next=/book" className="font-semibold underline">
            Enter your verification code
          </Link>{" "}
          — it was sent when you signed up.
        </p>
      )}

      {!waiverSigned && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          A signed liability waiver is required before your first booking.{" "}
          <Link href="/waiver?next=/book" className="font-semibold underline">
            Sign it now (takes 1 minute)
          </Link>{" "}
          — or you&apos;ll be asked at checkout.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="mt-8">
        <BookingWizard
          resources={resources}
          createReservation={createReservation}
          maxAdvanceDays={policy.advanceBookingDays}
          maxHoursPerSegment={policy.maxHoursPerSegment}
          maxSegmentsPerReservation={policy.maxSegmentsPerReservation}
        />
      </div>
    </div>
  );
}
