import { prisma } from "@/lib/prisma";

/**
 * Download a public (no-account) signed waiver PDF. Gated by the random
 * capability token issued at signing — there's no session to authorize against,
 * so the token (held only by the signer, and in their emailed link) is the key.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";

  const sig = await prisma.publicWaiverSignature.findUnique({
    where: { id },
    select: { downloadToken: true, pdfData: true, version: true },
  });
  // Constant-ish check: unknown id or wrong token → the same 404.
  if (!sig || !token || sig.downloadToken !== token) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(sig.pdfData), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="waiver-v${sig.version}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
