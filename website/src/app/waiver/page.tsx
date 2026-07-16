import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { getCurrentWaiver, hasCurrentWaiver } from "@/lib/waiver";
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
  .refine((d) => d.participantType !== "MINOR" || (d.minorName && d.minorName.length >= 2), {
    message: "minorName",
  })
  .refine((d) => d.participantType !== "MINOR" || (d.guardianRelation && d.guardianRelation.length >= 2), {
    message: "guardianRelation",
  });

async function signWaiverAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const next = String(formData.get("next") || "/dashboard");
  const parsed = signSchema.safeParse({
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
  if (!parsed.success) {
    redirect(`/waiver?next=${encodeURIComponent(next)}&error=1`);
  }
  const d = parsed.data;
  const isMinor = d.participantType === "MINOR";
  const mediaRelease = formData.get("declineMedia") !== "on";

  const document = await getCurrentWaiver();
  if (!document) redirect(next);

  // Collect the initials entered at each [[initial]] marker, in order. Every
  // marker must be initialled (2–6 chars) or the signature is rejected.
  const markerCount = countInitialMarkers(document.body);
  const initials: string[] = [];
  for (let i = 0; i < markerCount; i++) {
    const val = String(formData.get(`initial_${i}`) ?? "").trim();
    if (val.length < 2 || val.length > 6) {
      redirect(`/waiver?next=${encodeURIComponent(next)}&error=1`);
    }
    initials.push(val);
  }

  const headerList = await headers();
  const ipAddress =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    "unknown";
  const userAgent = headerList.get("user-agent") ?? null;

  // Append-only legal record: participant + guardian, contact/medical, IP,
  // doc version, timestamp, initials, media-release choice.
  const signature = await prisma.waiverSignature.create({
    data: {
      userId: session.user.id,
      documentId: document.id,
      version: document.version,
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
    },
  });

  // Seal the exact signed document as a PDF + tamper-evidence hash (industry standard).
  const bytes = await buildSignedWaiverPdf({
    document,
    signature,
    userEmail: session.user.email ?? "",
    initials,
  });
  await prisma.$transaction([
    prisma.waiverPdf.create({ data: { signatureId: signature.id, data: Buffer.from(bytes) } }),
    prisma.waiverSignature.update({
      where: { id: signature.id },
      data: { pdfSha256: sha256Hex(bytes) },
    }),
  ]);

  redirect(next);
}

export default async function WaiverPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/waiver");

  const { next = "/dashboard", error } = await searchParams;
  const [document, alreadySigned] = await Promise.all([
    getCurrentWaiver(),
    hasCurrentWaiver(session.user.id),
  ]);

  if (!document) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="display text-4xl text-navy">Waiver unavailable</h1>
        <p className="mt-4 text-navy/70">No active waiver document found. Please contact the front desk.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="display text-2xl leading-tight text-navy sm:text-3xl">{document.title}</h1>

      {!config.legalReviewed && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          DRAFT — this waiver text is a placeholder and has not yet been reviewed
          by an attorney. It will be replaced before launch.
        </p>
      )}

      {alreadySigned && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">
          You have already signed the current waiver (v{document.version}). Signing
          again adds a waiver for an additional participant (e.g., your child).
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          Please complete all required fields and accept the agreement.
        </p>
      )}

      <p className="mt-6 text-sm font-medium text-navy/70">
        {countInitialMarkers(document.body) > 0
          ? "Read the agreement, enter your initials in each highlighted box, complete your details, then sign at the bottom."
          : "Read the agreement, complete your details, then sign at the bottom."}
      </p>

      <form action={signWaiverAction} className="mt-2 space-y-5">
        <input type="hidden" name="next" value={next} />

        <WaiverBodyInitials body={document.body} />

        <WaiverRegistration />

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agree" required className="mt-0.5" />
          <span>
            I have read, understand, and agree to the entire Agreement above (v{document.version}),
            including the assumption of risk, release of liability, indemnification, and waiver of jury
            trial. My typed name constitutes my electronic signature.
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" required className="mt-0.5" />
          <span>
            I consent to sign this waiver electronically and to receive a copy in
            electronic form (ESIGN/UETA).
          </span>
        </label>

        <button type="submit" className="btn-brand w-full rounded-md px-4 py-2.5 uppercase tracking-wide">
          Sign waiver
        </button>
        <p className="text-xs text-navy/50">
          We record your name, the document version, date/time, and IP address
          for legal enforceability. Signed waivers appear in your account.
        </p>
      </form>
    </div>
  );
}
