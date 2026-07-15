import PhotoPlaceholder from "@/components/PhotoPlaceholder";
import { getAssetMeta } from "@/lib/media";

/**
 * Renders an admin-uploaded image for a media slot, falling back to the
 * branded PhotoPlaceholder when nothing has been published yet. The `?v=`
 * cache-buster (asset updatedAt) guarantees a re-upload shows immediately.
 *
 * Server component — queries only asset metadata (not the bytes); the actual
 * image is streamed from /api/media/[slot].
 */
export default async function SiteImage({
  slot,
  label,
  className = "",
  variant = "field",
}: {
  slot: string;
  label: string;
  className?: string;
  variant?: "field" | "sky" | "navy";
}) {
  const meta = await getAssetMeta(slot);

  if (!meta) {
    return <PhotoPlaceholder label={label} className={className} variant={variant} />;
  }

  const src = `/api/media/${slot}?v=${meta.updatedAt.getTime()}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- DB-served dynamic asset, not a static import
    <img
      src={src}
      alt={meta.alt || label}
      className={`rounded-2xl object-cover ${className}`}
    />
  );
}
