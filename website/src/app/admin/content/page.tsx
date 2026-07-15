import { requireStaff } from "@/lib/session";
import { getSettings, SETTING_FIELDS, isEnabled } from "@/lib/settings";
import { saveSettings } from "./actions";

export const metadata = { title: "Admin · Site content" };
export const dynamic = "force-dynamic";

const inputCls =
  "mt-1 w-full rounded-md border border-navy/20 px-2.5 py-1.5 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30";

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireStaff();
  const { error, ok } = await searchParams;
  const settings = await getSettings();

  return (
    <div className="max-w-3xl">
      <h1 className="display text-4xl text-navy">Site content</h1>
      <p className="mt-2 text-sm text-navy/60">
        Editable copy for the Soccer and Pricing pages. Changes apply immediately.
      </p>

      {ok && (
        <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">{ok}</p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      <form action={saveSettings} className="mt-8 space-y-6">
        {SETTING_FIELDS.map((field) => (
          <div key={field.key} className="rounded-2xl border border-navy/10 p-5">
            {field.type === "boolean" ? (
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name={field.key}
                  defaultChecked={isEnabled(settings[field.key])}
                  className="mt-0.5 h-4 w-4 rounded border-navy/30"
                />
                <span>
                  <span className="block text-sm font-semibold text-navy">{field.label}</span>
                  <span className="block text-xs text-navy/60">{field.help}</span>
                </span>
              </label>
            ) : (
              <label className="block">
                <span className="block text-sm font-semibold text-navy">{field.label}</span>
                <span className="block text-xs text-navy/60">{field.help}</span>
                {field.type === "textarea" ? (
                  <textarea
                    name={field.key}
                    rows={3}
                    defaultValue={settings[field.key]}
                    className={inputCls}
                  />
                ) : (
                  <input
                    type={field.type === "email" ? "email" : "text"}
                    name={field.key}
                    defaultValue={settings[field.key]}
                    className={inputCls}
                  />
                )}
              </label>
            )}
          </div>
        ))}

        <button className="btn-brand rounded-md px-6 py-2.5 text-sm font-bold uppercase">
          Save content
        </button>
      </form>
    </div>
  );
}
