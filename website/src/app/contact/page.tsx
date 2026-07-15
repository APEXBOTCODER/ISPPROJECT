export const metadata = { title: "Contact" };

export default function ContactPage() {
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
          {/* Swap for the real inbox once the domain email is live — README §Domain & launch */}
          <a href="mailto:hello@infinitysportspark.com" className="mt-2 block font-semibold text-sky hover:underline">
            hello@infinitysportspark.com
          </a>
        </div>
        <div className="rounded-2xl border border-navy/10 p-6">
          <h2 className="display text-xl text-navy">Phone</h2>
          <p className="mt-2 text-sm text-navy/70">
            Phone line opens with the park — Summer 2026.
          </p>
        </div>
        <div className="rounded-2xl border border-navy/10 p-6 sm:col-span-2">
          <h2 className="display text-xl text-navy">Visit</h2>
          <p className="mt-2 text-sm text-navy/70">Exact address announced closer to launch.</p>
        </div>
      </div>

      <p className="mt-8 rounded-md bg-sky/5 px-4 py-3 text-sm text-navy/70 ring-1 ring-sky/15">
        A contact form with spam protection ships before launch; for now email
        reaches us fastest.
      </p>
    </div>
  );
}
