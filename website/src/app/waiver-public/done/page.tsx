import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Waiver signed" };
export const dynamic = "force-dynamic";

export default async function PublicWaiverDonePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; token?: string }>;
}) {
  const { id, token } = await searchParams;
  const sig = id
    ? await prisma.publicWaiverSignature.findUnique({
        where: { id },
        select: { downloadToken: true, signerEmail: true, participantName: true, version: true },
      })
    : null;
  // Only show the download for the person who just signed (holds the token).
  if (!sig || !token || sig.downloadToken !== token) notFound();

  const href = `/api/waiver/public/${id}?token=${encodeURIComponent(token)}`;

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full gradient-brand text-3xl text-white">✓</div>
      <h1 className="display mt-6 text-4xl text-navy">Waiver signed</h1>
      <p className="mt-3 text-navy/70">
        Thanks, {sig.participantName}. Your signed liability waiver (v{sig.version}) is complete. We&apos;ve
        emailed a copy to <strong>{sig.signerEmail}</strong>.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a href={href} className="btn-brand rounded-md px-5 py-2.5 text-sm uppercase">Download PDF</a>
        <Link href="/" className="rounded-md border border-navy/20 px-5 py-2.5 text-sm font-semibold text-navy hover:bg-navy/5">
          Back to home
        </Link>
      </div>
      <p className="mt-6 text-xs text-navy/50">Didn&apos;t get the email? Check spam, or use the download button above.</p>
    </div>
  );
}
