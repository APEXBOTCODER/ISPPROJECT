import { auth } from "@/lib/auth";
import { loadSignatureForPdf, getSealedPdfBytes, pdfFileName } from "@/lib/waiverPdf";

/** Download the sealed signed-waiver PDF. Owner or staff only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const signature = await loadSignatureForPdf(id, {
    id: session.user.id,
    role: session.user.role,
  });
  if (!signature) return new Response("Not found", { status: 404 });

  const bytes = await getSealedPdfBytes(signature);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(signature)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
