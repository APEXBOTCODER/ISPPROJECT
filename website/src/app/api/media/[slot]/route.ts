import { prisma } from "@/lib/prisma";

/**
 * Streams an admin-uploaded image from the database. Referenced by SiteImage as
 * /api/media/[slot]?v=<updatedAt>. The version query string lets us cache
 * aggressively while still refreshing instantly after a re-upload.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slot: string }> }
) {
  const { slot } = await params;

  const asset = await prisma.mediaAsset.findUnique({ where: { slot } });
  if (!asset) {
    return new Response("Not found", { status: 404 });
  }

  const etag = `"${asset.updatedAt.getTime()}"`;
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "public, max-age=300, must-revalidate",
      ETag: etag,
    },
  });
}
