import { getSettings } from "@/lib/settings";

export const metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

/** Turn a phone string into a tel: href (digits and a leading + only). */
function telHref(phone: string): string {
  return "tel:" + phone.replace(/[^\d+]/g, "");
}

export default async function ContactPage() {
  const settings = await getSettings();
  const email = settings["contact.email"];
  const phone = settings["contact.phone"];
  const address = settings["contact.address"];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Get in <span className="gradient-text">touch</span>
      </h1>
      <p className="mt-3 text-navy/70">
        Tournaments, park hire, coaching, partnerships, or just cricket talk —
        we&apos;d love to hear from you.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-navy/10 p-6">
          <h2 className="display text-xl text-navy">Email</h2>
          {email ? (
            <a href={`mailto:${email}`} className="mt-2 block font-semibold text-sky hover:underline">
              {email}
            </a>
          ) : (
            <p className="mt-2 text-sm text-navy/70">Email coming soon.</p>
          )}
        </div>
        <div className="rounded-2xl border border-navy/10 p-6">
          <h2 className="display text-xl text-navy">Phone</h2>
          {phone ? (
            <a href={telHref(phone)} className="mt-2 block font-semibold text-sky hover:underline">
              {phone}
            </a>
          ) : (
            <p className="mt-2 text-sm text-navy/70">Phone line opens with the park.</p>
          )}
        </div>
        <div className="rounded-2xl border border-navy/10 p-6 sm:col-span-2">
          <h2 className="display text-xl text-navy">Visit</h2>
          {address ? (
            <p className="mt-2 whitespace-pre-line text-sm text-navy/70">{address}</p>
          ) : (
            <p className="mt-2 text-sm text-navy/70">Exact address announced closer to launch.</p>
          )}
        </div>
      </div>

      <p className="mt-8 rounded-md bg-sky/5 px-4 py-3 text-sm text-navy/70 ring-1 ring-sky/15">
        A contact form with spam protection ships before launch; for now email
        reaches us fastest.
      </p>
    </div>
  );
}
