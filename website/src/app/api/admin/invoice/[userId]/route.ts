import { requireStaff } from "@/lib/session";
import { generateUserInvoice, invoiceFilename } from "@/lib/invoice";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  await requireStaff();
  const { userId } = await params;
  const url = new URL(req.url);
  const result = await generateUserInvoice(userId, url.searchParams.get("from"), url.searchParams.get("to"));
  if (!result) return new Response("User not found", { status: 404 });

  const { pdf, user, from, to } = result;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceFilename(user.name, from, to)}"`,
      "Cache-Control": "no-store",
    },
  });
}
