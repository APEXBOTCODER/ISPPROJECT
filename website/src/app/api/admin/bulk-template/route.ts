import { requireStaff } from "@/lib/session";
import { buildSampleWorkbook } from "@/lib/bulkBookings";

export const dynamic = "force-dynamic";

/** Download the sample bulk-booking spreadsheet (staff only). */
export async function GET() {
  await requireStaff();
  const buf = await buildSampleWorkbook();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="bulk-bookings-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
