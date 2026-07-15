"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MEDIA_SLOT_KEYS,
} from "@/lib/media";

function fail(message: string): never {
  redirect("/admin/media?error=" + encodeURIComponent(message));
}

export async function uploadImage(formData: FormData) {
  await requireStaff();

  const slot = String(formData.get("slot") ?? "");
  if (!MEDIA_SLOT_KEYS.has(slot)) fail("Unknown image slot.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) fail("Please choose an image file.");

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    fail("Unsupported file type — upload a PNG, JPG, WebP, or AVIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    fail(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 6MB.`);
  }

  const alt = String(formData.get("alt") ?? "").slice(0, 200);
  const data = Buffer.from(await file.arrayBuffer());

  await prisma.mediaAsset.upsert({
    where: { slot },
    create: { slot, mimeType: file.type, data, alt },
    update: { mimeType: file.type, data, alt },
  });

  redirect("/admin/media?ok=" + encodeURIComponent(`Image published to "${slot}".`));
}

export async function removeImage(formData: FormData) {
  await requireStaff();
  const slot = String(formData.get("slot") ?? "");
  if (!MEDIA_SLOT_KEYS.has(slot)) fail("Unknown image slot.");

  await prisma.mediaAsset.deleteMany({ where: { slot } });
  redirect(
    "/admin/media?ok=" + encodeURIComponent(`Image removed from "${slot}" — placeholder restored.`)
  );
}
