import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { getSettings } from "@/lib/settings";
import { parkNow } from "@/lib/availability";
import { buildInvoicePdf } from "@/lib/invoicePdf";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Clamp/normalize an optional from/to range to valid YYYY-MM-DD, defaulting to
 *  the last 30 days. Untrusted input is validated by regex, never interpolated. */
export function normalizeRange(fromRaw?: string | null, toRaw?: string | null) {
  const now = parkNow();
  const to = DATE.test(toRaw ?? "") ? toRaw! : now.date;
  const from = DATE.test(fromRaw ?? "") ? fromRaw! : addDays(to, -30);
  return { from, to, issuedOn: now.date };
}

/** Build a user's invoice PDF for a date range. Returns null if no such user. */
export async function generateUserInvoice(userId: string, fromRaw?: string | null, toRaw?: string | null) {
  const { from, to, issuedOn } = normalizeRange(fromRaw, toRaw);
  const [user, bookings, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.booking.findMany({
      where: { userId, status: "CONFIRMED", date: { gte: from, lte: to } },
      include: { resource: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { startHour: "asc" }],
    }),
    getSettings(),
  ]);
  if (!user) return null;

  const pdf = await buildInvoicePdf({
    siteName: config.siteName,
    user,
    from,
    to,
    issuedOn,
    lines: bookings.map((b) => ({
      date: b.date,
      startHour: b.startHour,
      endHour: b.endHour,
      totalCents: b.totalCents,
      resourceName: b.resource.name,
    })),
    contactEmail: settings["contact.email"],
    zelleEmail: settings["payment.zelleEmail"],
    zelleName: settings["payment.zelleName"],
  });
  return { pdf, user, from, to, count: bookings.length };
}

export function invoiceFilename(name: string, from: string, to: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "user";
  return `invoice-${slug}-${from}_to_${to}.pdf`;
}
