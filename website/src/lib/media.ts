import { prisma } from "@/lib/prisma";

/**
 * Fixed registry of image "slots" that admins can publish photos into.
 * Each public page references a slot; SiteImage renders the uploaded photo
 * when present and otherwise falls back to the branded PhotoPlaceholder.
 * `recommended` is shown in the admin uploader so photos fit their frame.
 */
export type MediaSlot = {
  slot: string;
  label: string;
  tab: string;
  recommended: string;
};

export const MEDIA_SLOTS: MediaSlot[] = [
  // Home
  { slot: "home-cricket", label: "Home · cricket card", tab: "Home", recommended: "1200×675 (16:9) · JPG/WebP · < 2MB" },
  { slot: "home-soccer", label: "Home · soccer card", tab: "Home", recommended: "1200×675 (16:9) · JPG/WebP · < 2MB" },
  // Cricket
  { slot: "cricket-hero", label: "Cricket · panorama", tab: "Cricket", recommended: "1600×640 (2.5:1) · JPG/WebP · < 2MB" },
  // Soccer
  { slot: "soccer-hero", label: "Soccer · field", tab: "Soccer", recommended: "1600×640 (2.5:1) · JPG/WebP · < 2MB" },
  // Tournaments
  { slot: "tournaments-hero", label: "Tournaments · banner", tab: "Tournaments", recommended: "1600×500 (3.2:1) · JPG/WebP · < 2MB" },
  // Training
  { slot: "training-hero", label: "Training · facility", tab: "Training", recommended: "1600×560 (2.85:1) · JPG/WebP · < 2MB" },
  // About
  { slot: "about-1", label: "About · the grounds", tab: "About", recommended: "1000×560 (16:9) · JPG/WebP · < 2MB" },
  { slot: "about-2", label: "About · Argyle Cricket Club", tab: "About", recommended: "1000×560 (16:9) · JPG/WebP · < 2MB" },
  // Gallery (8 tiles)
  { slot: "gallery-1", label: "Gallery · aerial (tall)", tab: "Gallery", recommended: "1000×1250 (4:5, tall) · JPG/WebP · < 2MB" },
  { slot: "gallery-2", label: "Gallery · cricket pitch", tab: "Gallery", recommended: "1000×750 (4:3) · JPG/WebP · < 2MB" },
  { slot: "gallery-3", label: "Gallery · soccer sunset", tab: "Gallery", recommended: "1000×750 (4:3) · JPG/WebP · < 2MB" },
  { slot: "gallery-4", label: "Gallery · net lanes", tab: "Gallery", recommended: "1000×750 (4:3) · JPG/WebP · < 2MB" },
  { slot: "gallery-5", label: "Gallery · training interior (tall)", tab: "Gallery", recommended: "1000×1250 (4:5, tall) · JPG/WebP · < 2MB" },
  { slot: "gallery-6", label: "Gallery · family zone", tab: "Gallery", recommended: "1000×750 (4:3) · JPG/WebP · < 2MB" },
  { slot: "gallery-7", label: "Gallery · opening day", tab: "Gallery", recommended: "1000×750 (4:3) · JPG/WebP · < 2MB" },
  { slot: "gallery-8", label: "Gallery · ACC squad", tab: "Gallery", recommended: "1000×750 (4:3) · JPG/WebP · < 2MB" },
];

export const MEDIA_SLOT_KEYS = new Set(MEDIA_SLOTS.map((s) => s.slot));

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
];

/** Max upload size in bytes — kept under the server-action bodySizeLimit. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6MB

export type AssetMeta = { updatedAt: Date; alt: string };

/** Presence + metadata for a slot, WITHOUT loading the image bytes. */
export async function getAssetMeta(slot: string): Promise<AssetMeta | null> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { slot },
    select: { updatedAt: true, alt: true },
  });
  return asset ?? null;
}

/** Metadata for every slot that has an upload (bytes excluded). */
export async function getAllAssetMeta(): Promise<
  Record<string, AssetMeta>
> {
  const rows = await prisma.mediaAsset.findMany({
    select: { slot: true, updatedAt: true, alt: true },
  });
  const map: Record<string, AssetMeta> = {};
  for (const r of rows) map[r.slot] = { updatedAt: r.updatedAt, alt: r.alt };
  return map;
}
