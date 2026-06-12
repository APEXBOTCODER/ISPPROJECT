import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { legalDocs } from "@/content/legal";

export function generateStaticParams() {
  return legalDocs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = legalDocs.find((d) => d.slug === slug);
  return { title: doc?.title ?? "Legal" };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = legalDocs.find((d) => d.slug === slug);
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="display text-4xl text-navy">{doc.title}</h1>

      {!config.legalReviewed && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          DRAFT — this document is placeholder text pending attorney review and
          will be finalized before launch.
        </p>
      )}

      <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-navy/80">
        {doc.body}
      </div>

      <p className="mt-8 text-xs text-navy/50">
        Questions about this policy? Email hello@infinitysportspark.com.
      </p>
    </div>
  );
}
