import { requireStaff } from "@/lib/session";
import BulkUploadForm from "@/components/BulkUploadForm";

export const metadata = { title: "Admin · Bulk upload" };
export const dynamic = "force-dynamic";

export default async function BulkBookingsPage() {
  await requireStaff();

  return (
    <div className="max-w-3xl">
      <h1 className="display text-4xl text-navy">Bulk booking upload</h1>
      <p className="mt-2 text-sm text-navy/60">
        Book many dates at once from a spreadsheet — ideal for a club or organization reserving a
        run of slots. Bookings are created as confirmed (no online payment).
      </p>

      <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-navy/80">
        <li>
          <a href="/api/admin/bulk-template" className="font-semibold text-sky hover:underline">
            Download the sample template (.xlsx)
          </a>
          . It has a <strong>Bookings</strong> sheet plus an <strong>Available Grounds</strong> sheet
          listing the exact ground names to use (the Ground column is a dropdown).
        </li>
        <li>
          Fill one row per booking: <strong>Ground</strong> (exact name), <strong>Date</strong>{" "}
          (YYYY-MM-DD — <strong>past dates are allowed</strong>), <strong>From</strong> and{" "}
          <strong>To</strong> (whole hours 0–24, any duration), and{" "}
          <strong>Organization / Person</strong>.
        </li>
        <li>
          Upload the file below. As an admin upload the usual booking limits don&apos;t apply — past
          dates and custom/short hours are accepted, and the 2 hr / 4 hr minimum is waived. The only
          rule enforced is <strong>no overbooking</strong>: a row whose slot is already taken is
          rejected. Valid rows are booked; problem rows are listed so you can fix and re-upload just
          those.
        </li>
      </ol>

      <section className="mt-6 rounded-2xl border border-navy/10 p-5">
        <h2 className="display text-xl text-navy">Upload your file</h2>
        <BulkUploadForm />
      </section>
    </div>
  );
}
