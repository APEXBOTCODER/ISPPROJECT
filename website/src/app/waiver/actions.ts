"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { loadSignatureForPdf, getSealedPdfBytes, pdfFileName } from "@/lib/waiverPdf";

function back(returnTo: string, params: Record<string, string>): never {
  redirect(returnTo + (returnTo.includes("?") ? "&" : "?") + new URLSearchParams(params).toString());
}

/** Email the account holder their sealed signed-waiver PDF. Owner or staff. */
export async function emailSignedWaiver(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const signatureId = String(formData.get("signatureId") ?? "");
  const returnTo = String(formData.get("returnTo") || "/dashboard");

  const signature = await loadSignatureForPdf(signatureId, {
    id: session.user.id,
    role: session.user.role,
  });
  if (!signature) back(returnTo, { error: "Waiver record not found." });

  const bytes = await getSealedPdfBytes(signature);
  await sendEmail({
    to: signature.user.email,
    subject: `Your signed liability waiver (v${signature.version}) — ${config.siteName}`,
    text: [
      `Hi ${signature.user.name},`,
      ``,
      `Attached is your signed liability waiver — ${signature.participantName}, version ${signature.version}, signed ${signature.signedAt.toISOString().slice(0, 10)}.`,
      ``,
      `Keep this for your records.`,
      `${config.siteName} — ${config.tagline}`,
    ].join("\n"),
    attachments: [{ filename: pdfFileName(signature), content: bytes, contentType: "application/pdf" }],
  });

  await prisma.waiverSignature.update({
    where: { id: signature.id },
    data: { emailedAt: new Date() },
  });

  back(returnTo, { waiverEmailed: "1" });
}
