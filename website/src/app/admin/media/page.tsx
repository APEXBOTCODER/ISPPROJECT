import { requireStaff } from "@/lib/session";
import { MEDIA_SLOTS, getAllAssetMeta } from "@/lib/media";
import { uploadImage, removeImage } from "./actions";

export const metadata = { title: "Admin · Images" };
export const dynamic = "force-dynamic";

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireStaff();
  const { error, ok } = await searchParams;
  const assets = await getAllAssetMeta();

  // Group slots by tab for a scannable layout.
  const tabs = Array.from(new Set(MEDIA_SLOTS.map((s) => s.tab)));

  return (
    <div>
      <h1 className="display text-4xl text-navy">Images</h1>
      <p className="mt-2 text-sm text-navy/60">
        Publish real photos to each spot on the site. Until you upload one, a
        branded placeholder shows. Match the recommended size so the photo fills
        its frame without stretching. Max 6MB · PNG, JPG, WebP, or AVIF.
      </p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {tabs.map((tab) => (
        <section key={tab} className="mt-8">
          <h2 className="display text-2xl text-navy">{tab}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {MEDIA_SLOTS.filter((s) => s.tab === tab).map((s) => {
              const meta = assets[s.slot];
              return (
                <div key={s.slot} className="rounded-2xl border border-navy/10 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-navy">{s.label}</h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                        meta
                          ? "bg-green-50 text-green-700 ring-green-200"
                          : "bg-navy/5 text-navy/50 ring-navy/10"
                      }`}
                    >
                      {meta ? "Published" : "Placeholder"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-navy/50">
                    Recommended: {s.recommended}
                  </p>

                  {/* Current preview */}
                  <div className="mt-3 flex h-32 items-center justify-center overflow-hidden rounded-lg bg-navy/5">
                    {meta ? (
                      // eslint-disable-next-line @next/next/no-img-element -- DB-served preview
                      <img
                        src={`/api/media/${s.slot}?v=${meta.updatedAt.getTime()}`}
                        alt={meta.alt || s.label}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-navy/40">No image yet</span>
                    )}
                  </div>

                  {/* Upload */}
                  <form action={uploadImage} className="mt-3 space-y-2">
                    <input type="hidden" name="slot" value={s.slot} />
                    <input
                      type="file"
                      name="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      required
                      className="block w-full text-xs text-navy/70 file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-deep"
                    />
                    <input
                      name="alt"
                      placeholder="Alt text (accessibility)"
                      defaultValue={meta?.alt}
                      className="w-full rounded-md border border-navy/20 px-2.5 py-1.5 text-xs focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30"
                    />
                    <button className="btn-brand rounded-md px-4 py-1.5 text-xs font-bold uppercase">
                      {meta ? "Replace" : "Upload"}
                    </button>
                  </form>

                  {meta && (
                    <form action={removeImage} className="mt-2">
                      <input type="hidden" name="slot" value={s.slot} />
                      <button className="rounded-md border border-red-200 px-4 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                        Remove (restore placeholder)
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
