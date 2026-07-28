import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";
import { getCurrentWaiver } from "@/lib/waiver";
import { buildSignedWaiverPdf, sha256Hex } from "@/lib/waiverPdf";
import { countInitialMarkers } from "@/lib/waiverMarkers";
import WaiverBodyInitials from "@/components/WaiverBodyInitials";
import WaiverRegistration from "@/components/WaiverRegistration";

export const metadata = { title: "Liability Waiver" };
export const dynamic = "force-dynamic";

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s.length ? s : undefined;
};

const signSchema = z
  .object({
    email: z.string().email("email"),
    participantType: z.enum(["ADULT", "MINOR"]),
    signedName: z.string().min(2).max(100),
    participantDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date"),
    phone: z.string().min(7).max(30),
    address: z.string().max(200).optional(),
    emergencyName: z.string().min(2).max(100),
    emergencyPhone: z.string().min(7).max(30),
    allergies: z.string().max(1000).optional(),
    medical: z.string().max(1000).optional(),
    minorName: z.string().max(100).optional(),
    guardianRelation: z.string().max(60).optional(),
    agree: z.literal("on"),
    consent: z.literal("on"),
  })
  .refine((d) => d.participantType !== "MINOR" || (d.minorName && d.minorName.length >= 2), { message: "minorName" })
  .refine((d) => d.participantType !== "MINOR" || (d.guardianRelation && d.guardianRelation.length >= 2), { message: "guardianRelation" });

async function signPublicWaiver(formData: FormData) {
  "use server";
  // Spam protection: anyone can reach this page, so cap signings per IP.
  const ip = await clientIp();
  if (!rateLimit(`pubwaiver:${ip}`, 8, 60 * 60_000).ok) {
    redirect("/waiver-public?error=rate");
  }

  const parsed = signSchema.safeParse({
    email: str(formData.get("email")),
    participantType: formData.get("participantType"),
    signedName: str(formData.get("signedName")),
    participantDob: str(formData.get("participantDob")),
    phone: str(formData.get("phone")),
    address: str(formData.get("address")),
    emergencyName: str(formData.get("emergencyName")),
    emergencyPhone: str(formData.get("emergencyPhone")),
    allergies: str(formData.get("allergies")),
    medical: str(formData.get("medical")),
    minorName: str(formData.get("minorName")),
    guardianRelation: str(formData.get("guardianRelation")),
    agree: formData.get("agree"),
    consent: formData.get("consent"),
  });
  if (!parsed.success) redirect("/waiver-public?error=1");
  const d = parsed.data;
  const isMinor = d.participantType === "MINOR";
  const mediaRelease = formData.get("declineMedia") !== "on";

  const document = await getCurrentWaiver();
  if (!document) redirect("/waiver-public?error=1");

  const markerCount = countInitialMarkers(document.body);
  const initials: string[] = [];
  for (let i = 0; i < markerCount; i++) {
    const val = String(formData.get(`initial_${i}`) ?? "").trim();
    if (val.length < 2 || val.length > 6) redirect("/waiver-public?error=1");
    initials.push(val);
  }

  const headerList = await headers();
  const ipAddress = headerList.get("x-real-ip") ?? headerList.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "unknown";
  const userAgent = headerList.get("user-agent") ?? null;
  const downloadToken = randomBytes(24).toString("base64url");

  const signature = await prisma.publicWaiverSignature.create({
    data: {
      documentId: document.id,
      version: document.version,
      signerEmail: d.email,
      signedName: d.signedName,
      participantName: isMinor ? d.minorName! : d.signedName,
      participantType: d.participantType,
      participantDob: d.participantDob,
      minorDob: isMinor ? d.participantDob : undefined,
      guardianRelation: isMinor ? d.guardianRelation! : undefined,
      phone: d.phone,
      address: d.address,
      emergencyName: d.emergencyName,
      emergencyPhone: d.emergencyPhone,
      allergies: d.allergies,
      medical: d.medical,
      mediaRelease,
      ipAddress,
      userAgent,
      initials: initials.length ? JSON.stringify(initials) : null,
      consentEsign: true,
      downloadToken,
      pdfData: Buffer.from([]),
    },
  });

  // Seal the exact signed document + tamper-evidence hash, store it, and email it.
  const bytes = await buildSignedWaiverPdf({ document, signature, userEmail: d.email, initials });
  await prisma.publicWaiverSignature.update({
    where: { id: signature.id },
    data: { pdfData: Buffer.from(bytes), pdfSha256: sha256Hex(bytes), emailedAt: new Date() },
  });

  const link = `${config.siteUrl}/api/waiver/public/${signature.id}?token=${downloadToken}`;
  await sendEmail({
    to: d.email,
    subject: `Your signed liability waiver — ${config.siteName}`,
    text: [
      `Hi ${d.signedName},`,
      ``,
      `Attached is your signed liability waiver (${document.title}, v${document.version}, signed ${signature.signedAt.toISOString().slice(0, 10)}).`,
      `You can also re-download it here: ${link}`,
      ``,
      `Keep this for your records.`,
      `${config.siteName}`,
    ].join("\n"),
    attachments: [{ filename: `waiver-v${document.version}.pdf`, content: bytes, contentType: "application/pdf" }],
  });

  redirect(`/waiver-public/done?id=${signature.id}&token=${downloadToken}`);
}

export default async function PublicWaiverPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const document = await getCurrentWaiver();

  if (!document) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="display text-4xl text-navy">Waiver unavailable</h1>
        <p className="mt-4 text-navy/70">No active waiver document found. Please contact the front desk.</p>
      </div>
    );
  }

  const marks = countInitialMarkers(document.body);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="display text-2xl leading-tight text-navy sm:text-3xl">{document.title}</h1>
      <p className="mt-2 text-sm text-navy/60">
        Sign the liability waiver — no account needed. We&apos;ll email you a signed PDF copy and you can
        download it right after.
      </p>

      {error === "rate" && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          Too many submissions from your connection. Please wait a little while and try again.
        </p>
      )}
      {error === "1" && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          Please complete all required fields (including a valid email) and accept the agreement.
        </p>
      )}

      <form action={signPublicWaiver} className="mt-6 space-y-5">
        <label className="block text-sm font-medium text-navy">
          <span className="font-semibold text-red-500">*</span> Email (we send your signed copy here)
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
          />
        </label>

        <WaiverBodyInitials body={document.body} />
        {marks > 0 && (
          <p className="text-xs text-navy/50">Enter your initials at the {marks} highlighted boxes above.</p>
        )}

        <WaiverRegistration />

        <label className="flex items-start gap-2 rounded-lg border border-navy/10 bg-navy/[0.02] p-3 text-sm">
          <input type="checkbox" name="agree" required className="mt-0.5" />
          <span>
            <span className="font-semibold text-red-500">*</span> I have read, understand, and agree to the entire
            Agreement above (v{document.version}). My typed name constitutes my electronic signature.
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-lg border border-navy/10 bg-navy/[0.02] p-3 text-sm">
          <input type="checkbox" name="consent" required className="mt-0.5" />
          <span>
            <span className="font-semibold text-red-500">*</span> I consent to sign electronically and to receive a
            copy in electronic form (ESIGN/UETA).
          </span>
        </label>

        <button type="submit" className="btn-brand w-full rounded-md px-4 py-2.5 uppercase tracking-wide">
          Sign &amp; email me a copy
        </button>
        <p className="text-xs text-navy/50">
          We record your name, the document version, date/time, and IP address for legal enforceability.{" "}
          <Link href="/login" className="text-sky hover:underline">Have an account?</Link> Sign in to keep waivers on file.
        </p>
      </form>
    </div>
  );
}
