import { redirect } from "next/navigation";
import { z } from "zod";
import { getSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/clientIp";

export const metadata = { title: "Contact" };
export const dynamic = "force-dynamic";

/** Turn a phone string into a tel: href (digits and a leading + only). */
function telHref(phone: string): string {
  return "tel:" + phone.replace(/[^\d+]/g, "");
}

const contactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  message: z.string().min(10).max(4000),
});

async function submitContact(formData: FormData) {
  "use server";
  // Honeypot: the "company" field is hidden from people. A filled value means a
  // bot — accept silently (so it can't tell it was caught) without emailing.
  if (String(formData.get("company") ?? "").trim() !== "") redirect("/contact?sent=1");

  const ip = await clientIp();
  if (!rateLimit(`contact:${ip}`, 5, 60 * 60_000).ok) redirect("/contact?error=rate");

  const parsed = contactSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    message: String(formData.get("message") ?? "").trim(),
  });
  if (!parsed.success) redirect("/contact?error=1");
  const d = parsed.data;

  const settings = await getSettings();
  await sendEmail({
    to: settings["contact.email"],
    replyTo: d.email, // reply goes straight to the sender
    subject: `Contact form — ${d.name}`,
    text: [
      `New message from the website contact form:`,
      ``,
      `Name:  ${d.name}`,
      `Email: ${d.email}`,
      ...(d.phone ? [`Phone: ${d.phone}`] : []),
      ``,
      d.message,
    ].join("\n"),
  });

  redirect("/contact?sent=1");
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const settings = await getSettings();
  const email = settings["contact.email"];
  const phone = settings["contact.phone"];
  const address = settings["contact.address"];
  const { sent, error } = await searchParams;

  const inputCls =
    "mt-1 w-full rounded-md border border-navy/20 px-3 py-2 text-sm focus:border-sky focus:outline-none focus:ring-2 focus:ring-sky/30";

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

      {/* Contact form */}
      <section className="mt-8 rounded-2xl border border-navy/10 p-6">
        <h2 className="display text-2xl text-navy">Send us a message</h2>

        {sent && (
          <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">
            Thanks — your message is on its way. We&apos;ll reply to the email you gave us.
          </p>
        )}
        {error === "rate" && (
          <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            You&apos;ve sent a few messages already — please wait a little while before sending another.
          </p>
        )}
        {error === "1" && (
          <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            Please add your name, a valid email, and a message (at least 10 characters).
          </p>
        )}

        <form action={submitContact} className="mt-4 space-y-4">
          {/* Honeypot — hidden from people, catches bots. */}
          <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
            <label>
              Company
              <input type="text" name="company" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-navy">
              Name
              <input name="name" required minLength={2} maxLength={100} autoComplete="name" className={inputCls} />
            </label>
            <label className="block text-sm font-medium text-navy">
              Email
              <input name="email" type="email" required autoComplete="email" className={inputCls} />
            </label>
          </div>
          <label className="block text-sm font-medium text-navy">
            Phone <span className="font-normal text-navy/50">(optional)</span>
            <input name="phone" type="tel" maxLength={40} autoComplete="tel" className={inputCls} />
          </label>
          <label className="block text-sm font-medium text-navy">
            Message
            <textarea name="message" required minLength={10} maxLength={4000} rows={6} className={inputCls} />
          </label>
          <button type="submit" className="btn-brand rounded-md px-6 py-2.5 text-sm font-bold uppercase tracking-wide">
            Send message
          </button>
        </form>
      </section>
    </div>
  );
}
