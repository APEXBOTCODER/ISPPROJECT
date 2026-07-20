import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { config } from "@/lib/config";
import { parkNow } from "@/lib/availability";
import { buildInvoicePdf } from "@/lib/invoicePdf";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  await requireStaff();
  const { userId } = await params;
  const url = new URL(req.url);
  const now = parkNow();
  const to = DATE.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : now.date;
  const from = DATE.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : addDays(to, -30);

  const [user, bookings, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.booking.findMany({
      where: { userId, status: "CONFIRMED", date: { gte: from, lte: to } },
      include: { resource: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { startHour: "asc" }],
    }),
    getSettings(),
  ]);
  if (!user) return new Response("User not found", { status: 404 });

  const pdf = await buildInvoicePdf({
    siteName: config.siteName,
    user,
    from,
    to,
    issuedOn: now.date,
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

  const slug = user.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "user";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${slug}-${from}_to_${to}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
