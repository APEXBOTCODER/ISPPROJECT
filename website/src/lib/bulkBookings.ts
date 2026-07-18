import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { priceForHours } from "@/lib/pricing";
import { parkNow, slotKey } from "@/lib/availability";

const HEADERS = [
  "Ground",
  "Date (YYYY-MM-DD)",
  "From (hour 0-23)",
  "To (hour 0-23)",
  "Organization / Person",
];

const pad = (n: number) => String(n).padStart(2, "0");
function addDaysStr(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------- template ----

/** Build the sample .xlsx: a Bookings sheet (with a Ground dropdown) + a sheet
 *  listing the exact available ground names to use. */
export async function buildSampleWorkbook(): Promise<Buffer> {
  const resources = await prisma.resource.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Infinity Sports Park";

  const grounds = wb.addWorksheet("Available Grounds");
  grounds.columns = [{ header: "Available grounds — use these EXACT names", key: "name", width: 42 }];
  grounds.getRow(1).font = { bold: true };
  resources.forEach((r) => grounds.addRow([r.name]));
  const lastGroundRow = resources.length + 1;

  const sheet = wb.addWorksheet("Bookings");
  sheet.columns = HEADERS.map((h, i) => ({
    header: h,
    key: `c${i}`,
    width: i === 0 || i === 4 ? 28 : 18,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { wrapText: true, vertical: "middle" };

  // Example rows using real ground names + near-future dates.
  const now = parkNow();
  const g0 = resources[0]?.name ?? "Cricket Ground A";
  const g1 = resources[1]?.name ?? g0;
  sheet.addRow([g0, addDaysStr(now.date, 7), 18, 20, "Argyle Cricket Club"]);
  sheet.addRow([g1, addDaysStr(now.date, 8), 9, 13, "John Smith"]);

  // Dropdown on the Ground column, referencing the Available Grounds list.
  if (lastGroundRow >= 2) {
    for (let r = 2; r <= 500; r++) {
      sheet.getCell(`A${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'Available Grounds'!$A$2:$A$${lastGroundRow}`],
      };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// ------------------------------------------------------------- parse+create ----

export type BulkRowResult = { row: number; ok: boolean; message: string };
export type BulkResult = { created: number; failed: number; results: BulkRowResult[] };

function parseHour(v: ExcelJS.CellValue): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.floor(v) : null;
  const s = String(v).trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::\d{2})?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const ampm = m[2];
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h;
}

function parseDate(v: ExcelJS.CellValue): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // MM/DD/YYYY
  if (m) return `${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  return null;
}

/** A shared system account that owns external/bulk bookings (no login). */
async function getExternalUser() {
  return prisma.user.upsert({
    where: { email: "external-bookings@infinitysportspark.invalid" },
    update: {},
    create: {
      email: "external-bookings@infinitysportspark.invalid",
      name: "External / Bulk Bookings",
      role: "CUSTOMER",
      emailVerified: new Date(),
    },
  });
}

/** Read the uploaded workbook, validate each row, and create confirmed bookings.
 *  Every row is independent — a bad row is reported and the rest still proceed. */
export async function parseAndCreateBulk(
  buffer: Buffer,
  staff: { id: string; name: string }
): Promise<BulkResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.getWorksheet("Bookings") ?? wb.worksheets[0];
  if (!sheet) {
    return { created: 0, failed: 1, results: [{ row: 0, ok: false, message: "No sheet found in the file." }] };
  }

  // Admin bulk upload is trusted: it may enter PAST dates and CUSTOM hours, and
  // the 2h/4h minimum does NOT apply. The one hard rule kept is no overbooking
  // (enforced by the unique slot constraint below).
  const resources = await prisma.resource.findMany({ where: { active: true } });
  const byName = new Map(resources.map((r) => [r.name.trim().toLowerCase(), r]));

  type Row = { rowNum: number; ground: string; date: string | null; from: number | null; to: number | null; org: string };
  const rows: Row[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const ground = String(row.getCell(1).value ?? "").trim();
    const date = parseDate(row.getCell(2).value);
    const from = parseHour(row.getCell(3).value);
    const to = parseHour(row.getCell(4).value);
    const org = String(row.getCell(5).value ?? "").trim();
    if (!ground && !date && from == null && to == null && !org) return; // blank
    rows.push({ rowNum: rowNumber, ground, date, from, to, org });
  });

  if (rows.length === 0) {
    return { created: 0, failed: 1, results: [{ row: 0, ok: false, message: "No data rows found (fill rows under the header)." }] };
  }

  const externalUser = await getExternalUser();
  const results: BulkRowResult[] = [];
  let created = 0;

  for (const r of rows) {
    const fail = (message: string) => results.push({ row: r.rowNum, ok: false, message });
    const resource = byName.get(r.ground.toLowerCase());
    if (!resource) { fail(`Ground "${r.ground}" not found — use an exact name from the Available Grounds sheet.`); continue; }
    if (!r.date) { fail("Invalid or missing date — use YYYY-MM-DD."); continue; }
    if (r.from == null || r.to == null) { fail("Invalid From/To — use whole hours 0–24."); continue; }
    if (r.from < 0 || r.to > 24 || r.to <= r.from) { fail("From must be before To, within hours 0–24."); continue; }
    if (!r.org) { fail("Organization / Person is required."); continue; }
    // Past dates and custom/short durations are intentionally allowed here.
    const duration = r.to - r.from;

    const hours = Array.from({ length: duration }, (_, i) => (r.from as number) + i);
    const ref = `BULK-${randomUUID()}`;
    const total = priceForHours(resource, r.date, hours);
    try {
      await prisma.$transaction(async (tx) => {
        const res = await tx.reservation.create({
          data: { userId: externalUser.id, kind: "BOOKING", label: r.org, totalCents: total, status: "CONFIRMED", paymentRef: ref, notes: `Bulk upload by ${staff.name}` },
        });
        const booking = await tx.booking.create({
          data: { userId: externalUser.id, reservationId: res.id, resourceId: resource.id, date: r.date as string, startHour: r.from as number, endHour: r.to as number, status: "CONFIRMED", totalCents: total, paymentRef: ref },
        });
        await tx.bookingSlot.createMany({
          data: hours.map((h) => ({ bookingId: booking.id, resourceId: resource.id, slotKey: slotKey(r.date as string, h) })),
        });
      });
      created += 1;
      results.push({ row: r.rowNum, ok: true, message: `${resource.name} · ${r.date} · ${r.from}:00–${r.to}:00 · ${r.org}` });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === "P2002") {
        fail(`Already booked — ${resource.name} ${r.date} ${r.from}:00–${r.to}:00.`);
      } else {
        fail("Could not create this booking (unexpected error).");
      }
    }
  }

  return { created, failed: results.filter((x) => !x.ok).length, results };
}
