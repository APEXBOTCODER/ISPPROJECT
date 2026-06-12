export const metadata = { title: "FAQ" };

const faqs = [
  {
    q: "When does the park open?",
    a: "Summer 2026. Online booking opens before the gates do — follow us or create an account to be notified.",
  },
  {
    q: "How do bookings work?",
    a: "Pick a sport, facility, date, and hours; pay online; get instant confirmation by email. Slots are hourly, and you can book up to 60 days ahead.",
  },
  {
    q: "What's the cancellation policy?",
    a: "Full refund 48+ hours before your slot, 50% between 24 and 48 hours, no refund inside 24 hours. Cancel from your dashboard — refunds are automatic.",
  },
  {
    q: "Do I need to sign a waiver?",
    a: "Yes — every participant needs a signed liability waiver before first play. You sign it online once, and again only when the document changes. Parents/guardians sign for minors.",
  },
  {
    q: "What is peak pricing?",
    a: "Weekday evenings from 5pm and all day Saturday/Sunday are peak hours and carry a higher hourly rate, shown clearly before you pay.",
  },
  {
    q: "Can I book a recurring weekly slot for my team?",
    a: "Team recurring bookings are coming with the membership program. Until then, book individual weeks — or contact us and staff can set it up for you.",
  },
  {
    q: "Is equipment provided?",
    a: "Match balls, flags, and basic gear are available at the front desk. Teams bring their own bats, pads, and boots. Bowling machine rental is available for net lanes.",
  },
  {
    q: "Is the park family friendly?",
    a: "Completely. Shaded seating, open sight lines, and family zones at events. Kids' programs start with the training academy.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Frequently asked <span className="gradient-text">questions</span>
      </h1>
      <div className="mt-8 space-y-3">
        {faqs.map((f) => (
          <details key={f.q} className="group rounded-xl border border-navy/10 p-5 open:bg-navy/[0.02]">
            <summary className="cursor-pointer font-semibold text-navy marker:text-pitch">
              {f.q}
            </summary>
            <p className="mt-3 text-sm leading-6 text-navy/70">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
