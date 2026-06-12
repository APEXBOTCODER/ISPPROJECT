import Link from "next/link";

export const metadata = { title: "Tournaments & Events" };

const upcoming = [
  {
    name: "Grand Opening Cup — T10 Cricket",
    date: "Summer 2026 · opening weekend",
    text: "16-team tape-ball tournament to christen the grounds. Trophies, food trucks, family zone.",
  },
  {
    name: "Infinity Soccer League — Season 1",
    date: "Fall 2026",
    text: "7v7 league across two divisions. 8 match guarantee plus playoffs.",
  },
  {
    name: "Corporate Sports Day",
    date: "Dates on request",
    text: "Private park hire for company events — cricket, soccer, and field games with catering options.",
  },
];

export default function TournamentsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Tournaments &amp; <span className="gradient-text">Events</span>
      </h1>
      <p className="mt-3 max-w-2xl text-navy/70">
        Compete. Inspire. From league seasons to one-day cups, the park is built
        to host. Team registration opens as we approach launch.
      </p>

      <div className="mt-10 space-y-5">
        {upcoming.map((event) => (
          <div key={event.name} className="card-lift rounded-2xl border border-navy/10 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <h2 className="display text-2xl text-navy">{event.name}</h2>
              <p className="mt-1 text-sm font-semibold text-pitch-deep">{event.date}</p>
              <p className="mt-2 text-sm leading-6 text-navy/70">{event.text}</p>
            </div>
            <Link
              href="/contact"
              className="mt-4 inline-block shrink-0 rounded-full border border-navy/20 px-5 py-2.5 text-sm font-semibold text-navy hover:bg-navy/5 sm:mt-0"
            >
              Register interest
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-8 text-sm text-navy/60">
        Want to run your own tournament at Infinity?{" "}
        <Link href="/contact" className="font-semibold text-sky hover:underline">
          Talk to us about park hire →
        </Link>
      </p>
    </div>
  );
}
