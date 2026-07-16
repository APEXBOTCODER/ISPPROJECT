import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { getCurrentWaiver } from "@/lib/waiver";
import { publishWaiverVersion, editWaiverDraft } from "./actions";

export const metadata = { title: "Admin · Waiver" };
export const dynamic = "force-dynamic";

const inputCls =
  "mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30";

export default async function AdminWaiverPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "ADMIN";
  const { ok, error } = await searchParams;

  const [current, versions, signatures] = await Promise.all([
    getCurrentWaiver(),
    prisma.waiverDocument.findMany({
      orderBy: { version: "desc" },
      include: { _count: { select: { signatures: true } } },
    }),
    prisma.waiverSignature.findMany({
      orderBy: { signedAt: "desc" },
      take: 100,
      include: { user: true },
    }),
  ]);

  const currentCount = versions.find((v) => v.id === current?.id)?._count.signatures ?? 0;
  const currentEditable = current && currentCount === 0;

  return (
    <div>
      <h1 className="display text-4xl text-navy">Liability waiver</h1>
      <p className="mt-2 text-sm text-navy/60">
        Waivers are versioned and append-only. Publishing a new version requires every
        user to re-sign. A signed version can never be edited — its exact text is the
        legal record.
      </p>

      {ok && <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>}
      {error && <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {!config.legalReviewed && (
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          DRAFT — set <code>LEGAL_REVIEWED=true</code> once the attorney-approved text is live. Signed PDFs carry a DRAFT watermark until then.
        </p>
      )}

      {/* Current version */}
      <section className="mt-8 rounded-2xl border border-navy/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-2xl text-navy">
            Current version {current ? `· v${current.version}` : ""}
          </h2>
          {current && (
            <span className="text-xs text-navy/50">{currentCount} signature(s)</span>
          )}
        </div>
        {current ? (
          <>
            <p className="mt-1 text-sm font-semibold text-navy">{current.title}</p>
            <div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-navy/[0.03] p-4 text-xs leading-6 text-navy/80">
              {current.body}
            </div>
            {isAdmin && currentEditable && (
              <form action={editWaiverDraft} className="mt-4 space-y-2 rounded-lg border border-dashed border-pitch/40 p-4">
                <p className="text-xs font-semibold text-navy/60">Edit current version (no signatures yet — safe to edit)</p>
                <input type="hidden" name="id" value={current.id} />
                <input name="title" defaultValue={current.title} className={inputCls} />
                <textarea name="body" rows={8} defaultValue={current.body} className={inputCls} />
                <p className="text-xs text-navy/50">
                  Use <code className="rounded bg-navy/5 px-1">[[initial]]</code> to add an initials box.
                </p>
                <button className="btn-brand rounded-md px-4 py-2 text-sm font-bold uppercase">Save text</button>
              </form>
            )}
            {isAdmin && !currentEditable && (
              <p className="mt-3 text-xs text-navy/50">
                This version has signatures and can&apos;t be edited. Publish a new version below to change the text.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-navy/60">No waiver published yet.</p>
        )}
      </section>

      {/* Publish new version */}
      {isAdmin && (
        <section className="mt-6 rounded-2xl border-2 border-dashed border-pitch/40 p-5">
          <h2 className="display text-2xl text-navy">Publish new version</h2>
          <p className="mt-1 text-sm text-navy/60">
            Creates v{(versions[0]?.version ?? 0) + 1}. Everyone will be re-prompted to sign before their next booking.
          </p>
          <form action={publishWaiverVersion} className="mt-4 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-navy/60">
              Title
              <input name="title" required defaultValue={current?.title} className={inputCls} />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-navy/60">
              Waiver text
              <textarea name="body" required rows={12} defaultValue={current?.body} className={inputCls} />
            </label>
            <p className="text-xs text-navy/50">
              Tip: type <code className="rounded bg-navy/5 px-1">[[initial]]</code> anywhere the signer must
              initial. Each becomes a required initials box on the signing page and prints inline on the PDF.
            </p>
            <button className="btn-brand rounded-md px-5 py-2 text-sm font-bold uppercase">Publish new version</button>
          </form>
        </section>
      )}

      {/* Version history */}
      <section className="mt-8">
        <h2 className="display text-2xl text-navy">Version history</h2>
        <ul className="mt-3 space-y-2">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy/10 px-4 py-2.5 text-sm">
              <span>
                <strong>v{v.version}</strong> · {v.title}
                {v.active && <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-green-200">Active</span>}
              </span>
              <span className="text-xs text-navy/50">{v._count.signatures} signature(s) · {v.createdAt.toISOString().slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Signatures log */}
      <section className="mt-8">
        <h2 className="display text-2xl text-navy">Signatures log</h2>
        {signatures.length === 0 ? (
          <p className="mt-3 text-sm text-navy/60">No signatures yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-navy/15 text-xs uppercase text-navy/50">
                  <th className="py-2 pr-4">Signed</th>
                  <th className="py-2 pr-4">Participant</th>
                  <th className="py-2 pr-4">Signer / account</th>
                  <th className="py-2 pr-4">Ver</th>
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2 pr-4">Hash</th>
                  <th className="py-2 pr-4">Emailed</th>
                  <th className="py-2">PDF</th>
                </tr>
              </thead>
              <tbody>
                {signatures.map((s) => (
                  <tr key={s.id} className="border-b border-navy/5">
                    <td className="py-2 pr-4 whitespace-nowrap text-navy/60">{s.signedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td className="py-2 pr-4 font-medium text-navy">{s.participantName}</td>
                    <td className="py-2 pr-4">
                      {s.signedName}
                      <span className="block text-xs text-navy/50">{s.user.email}</span>
                    </td>
                    <td className="py-2 pr-4">v{s.version}</td>
                    <td className="py-2 pr-4 text-navy/60">{s.ipAddress}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-navy/50">{s.pdfSha256 ? s.pdfSha256.slice(0, 10) : "—"}</td>
                    <td className="py-2 pr-4 text-navy/60">{s.emailedAt ? s.emailedAt.toISOString().slice(0, 10) : "—"}</td>
                    <td className="py-2">
                      <Link href={`/api/waiver/pdf/${s.id}`} className="font-semibold text-sky hover:underline">
                        Download
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
