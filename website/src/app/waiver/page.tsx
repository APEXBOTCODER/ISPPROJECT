import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { getCurrentWaiver, hasCurrentWaiver } from "@/lib/waiver";

export const metadata = { title: "Liability Waiver" };
export const dynamic = "force-dynamic";

const signSchema = z.object({
  signedName: z.string().min(2).max(100),
  minorName: z.string().max(100).optional(),
  minorDob: z.string().max(10).optional(),
  guardianRelation: z.string().max(50).optional(),
  agree: z.literal("on"),
});

async function signWaiverAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const next = String(formData.get("next") || "/dashboard");
  const parsed = signSchema.safeParse({
    signedName: formData.get("signedName"),
    minorName: formData.get("minorName") || undefined,
    minorDob: formData.get("minorDob") || undefined,
    guardianRelation: formData.get("guardianRelation") || undefined,
    agree: formData.get("agree"),
  });
  if (!parsed.success) {
    redirect(`/waiver?next=${encodeURIComponent(next)}&error=1`);
  }

  const document = await getCurrentWaiver();
  if (!document) redirect(next);

  const headerList = await headers();
  const ipAddress =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    "unknown";

  // Append-only legal record: signer + optional minor, IP, doc version, timestamp
  await prisma.waiverSignature.create({
    data: {
      userId: session.user.id,
      documentId: document.id,
      version: document.version,
      signedName: parsed.data.signedName,
      participantName: parsed.data.minorName || parsed.data.signedName,
      minorDob: parsed.data.minorDob,
      guardianRelation: parsed.data.minorName
        ? parsed.data.guardianRelation || "Parent/Guardian"
        : undefined,
      ipAddress,
    },
  });

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
      <h1 className="display text-4xl text-navy">Liability Waiver &amp; Release</h1>

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

      <div className="mt-6 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-navy/15 bg-navy/[0.03] p-5 text-sm leading-6 text-navy/90">
        {document.body}
      </div>

      <form action={signWaiverAction} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="signedName" className="block text-sm font-medium">
            Type your full legal name (electronic signature)
          </label>
          <input
            id="signedName"
            name="signedName"
            required
            className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2 italic focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
            placeholder="Jane Q. Public"
          />
        </div>

        <details className="rounded-md border border-navy/15 p-3">
          <summary className="cursor-pointer text-sm font-medium text-navy">
            Signing for a minor? (parent/guardian waiver)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label htmlFor="minorName" className="block text-xs font-medium">Minor&apos;s name</label>
              <input id="minorName" name="minorName" className="mt-1 w-full rounded-md border border-navy/20 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label htmlFor="minorDob" className="block text-xs font-medium">Date of birth</label>
              <input id="minorDob" name="minorDob" type="date" className="mt-1 w-full rounded-md border border-navy/20 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label htmlFor="guardianRelation" className="block text-xs font-medium">Relationship</label>
              <input id="guardianRelation" name="guardianRelation" placeholder="Parent" className="mt-1 w-full rounded-md border border-navy/20 px-2 py-1.5 text-sm" />
            </div>
          </div>
        </details>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agree" required className="mt-0.5" />
          <span>
            I have read and agree to the Waiver &amp; Release above (v{document.version}).
            My typed name constitutes my electronic signature.
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
