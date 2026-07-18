"use server";

import { requireStaff } from "@/lib/session";
import { parseAndCreateBulk, type BulkResult } from "@/lib/bulkBookings";

export type UploadState = { error?: string; result?: BulkResult };

/** Handle the uploaded .xlsx and create the bookings. Used with useActionState. */
export async function uploadBulk(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const staff = await requireStaff();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose an .xlsx file to upload." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "File is too large (max 5 MB)." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await parseAndCreateBulk(buffer, { id: staff.id, name: staff.name ?? "Staff" });
    return { result };
  } catch {
    return { error: "Couldn't read that file — make sure it's an .xlsx from the template." };
  }
}
