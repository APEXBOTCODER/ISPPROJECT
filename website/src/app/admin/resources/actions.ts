"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/media";

const SPORTS = ["CRICKET", "SOCCER", "NETS", "TRAINING"] as const;

// Rates are entered in dollars in the UI and stored as cents.
const resourceSchema = z
  .object({
    name: z.string().min(3, "Name is too short").max(80),
    sport: z.enum(SPORTS),
    description: z.string().min(10, "Please add a short description").max(500),
    openHour: z.coerce.number().int().min(0).max(23),
    closeHour: z.coerce.number().int().min(1).max(24),
    baseRate: z.coerce
      .number()
      .min(0)
      .max(10_000)
      .transform((dollars) => Math.round(dollars * 100)),
    peakRate: z.coerce
      .number()
      .min(0)
      .max(10_000)
      .transform((dollars) => Math.round(dollars * 100)),
    sortOrder: z.coerce.number().int().min(0).max(999),
  })
  .refine((r) => r.closeHour > r.openHour, {
    message: "Closing hour must be after opening hour",
  });

function parseResourceForm(formData: FormData) {
  return resourceSchema.safeParse({
    name: formData.get("name"),
    sport: formData.get("sport"),
    description: formData.get("description"),
    openHour: formData.get("openHour"),
    closeHour: formData.get("closeHour"),
    baseRate: formData.get("baseRate"),
    peakRate: formData.get("peakRate"),
    sortOrder: formData.get("sortOrder"),
  });
}

function fail(message: string): never {
  redirect("/admin/resources?error=" + encodeURIComponent(message));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createResource(formData: FormData) {
  await requireStaff();
  const parsed = parseResourceForm(formData);
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid input");

  // Ensure a unique slug even when names collide
  const base = slugify(parsed.data.name) || "facility";
  let slug = base;
  for (let i = 2; await prisma.resource.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${i}`;
  }

  await prisma.resource.create({ data: { ...parsed.data, slug } });
  redirect("/admin/resources?ok=" + encodeURIComponent(`"${parsed.data.name}" added.`));
}

export async function updateResource(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const parsed = parseResourceForm(formData);
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const existing = await prisma.resource.findUnique({ where: { id } });
  if (!existing) fail("Facility not found.");

  await prisma.resource.update({ where: { id }, data: parsed.data });
  redirect("/admin/resources?ok=" + encodeURIComponent(`"${parsed.data.name}" saved.`));
}

/** Hide a facility from booking without touching its history. */
export async function toggleResourceActive(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const resource = await prisma.resource.findUnique({ where: { id } });
  if (!resource) fail("Facility not found.");

  await prisma.resource.update({
    where: { id },
    data: { active: !resource.active },
  });
  redirect(
    "/admin/resources?ok=" +
      encodeURIComponent(
        `"${resource.name}" is now ${resource.active ? "hidden from booking" : "bookable"}.`
      )
  );
}

/** Permanent delete — only allowed when the facility has no booking history. */
export async function deleteResource(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const resource = await prisma.resource.findUnique({
    where: { id },
    include: { _count: { select: { bookings: true } } },
  });
  if (!resource) fail("Facility not found.");

  if (resource._count.bookings > 0) {
    fail(
      `"${resource.name}" has ${resource._count.bookings} booking(s) on record. ` +
        "Deactivate it instead — deleting would destroy customers' booking history."
    );
  }

  await prisma.resource.delete({ where: { id } });
  redirect("/admin/resources?ok=" + encodeURIComponent(`"${resource.name}" deleted.`));
}

/** Upload/replace one facility's photo. Stored as a MediaAsset in the slot
 *  `facility-<id>` and served from /api/media/[slot] like the other site images. */
export async function uploadFacilityImage(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const resource = await prisma.resource.findUnique({ where: { id }, select: { name: true } });
  if (!resource) fail("Facility not found.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) fail("Please choose an image file.");
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    fail("Unsupported file type — upload a PNG, JPG, WebP, or AVIF image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    fail(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 6MB.`);
  }

  const slot = `facility-${id}`;
  const data = Buffer.from(await file.arrayBuffer());
  await prisma.mediaAsset.upsert({
    where: { slot },
    create: { slot, mimeType: file.type, data, alt: resource.name },
    update: { mimeType: file.type, data, alt: resource.name },
  });
  redirect("/admin/resources?ok=" + encodeURIComponent(`Photo updated for "${resource.name}".`));
}

/** Remove a facility's photo (restores the branded placeholder). */
export async function removeFacilityImage(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const resource = await prisma.resource.findUnique({ where: { id }, select: { name: true } });
  await prisma.mediaAsset.deleteMany({ where: { slot: `facility-${id}` } });
  redirect("/admin/resources?ok=" + encodeURIComponent(`Photo removed${resource ? ` for "${resource.name}"` : ""}.`));
}
