import Link from "next/link";
import { config } from "@/lib/config";
import InfinityMark from "@/components/InfinityMark";
import PhotoPlaceholder from "@/components/PhotoPlaceholder";

const features = [
  { icon: "🏏", title: "Cricket Grounds", text: "Two full-size grounds with turf and artificial pitches for T20, T10, and tape-ball." },
  { icon: "⚽", title: "Soccer Fields", text: "Regulation 11v11 and 7v7 fields with premium Bermuda grass." },
  { icon: "🏃", title: "Training Facility", text: "Indoor turf space for fitness, agility, and skills development." },
  { icon: "🥅", title: "Practice Nets", text: "Enclosed lanes with bowling-machine add-ons for serious net sessions." },
  { icon: "🏆", title: "Tournaments & Events", text: "Leagues, corporate cups, and community tournaments year-round." },
  { icon: "👨‍👩‍👧‍👦", title: "Family Friendly", text: "Shaded seating, safe surroundings, and space for the whole crew." },
];

const rhythm = ["Play", "Train", "Compete", "Inspire"];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(30,111,217,0.25),transparent_60%)]" aria-hidden="true" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center px-4 py-20 text-center sm:py-28">
          <InfinityMark className="h-20 w-auto sm:h-24" animate />
          <h1 className="display mt-6 text-5xl sm:text-7xl">
            Infinity <span className="gradient-text">Sports Park</span>
          </h1>
          <p className="mt-3 text-lg font-semibold uppercase tracking-[0.2em] text-white/80">
            Cricket • Soccer • Training • More
          </p>
          <p className="mt-2 flex flex-wrap justify-center gap-x-3 text-sm font-medium uppercase tracking-widest text-white/60">
            {rhythm.map((word, i) => (
              <span key={word}>
                <span className={i % 2 === 0 ? "text-pitch" : "text-sky"}>{word}</span>
                {i < rhythm.length - 1 && <span className="ml-3 text-white/30">•</span>}
              </span>
            ))}
          </p>

          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-bold uppercase tracking-wide">
            <span className="h-2 w-2 animate-pulse rounded-full bg-pitch" aria-hidden="true" />
            {config.launchLabel}
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/book" className="btn-brand rounded-full px-8 py-3.5 text-base uppercase tracking-wide">
              Book a Field
            </Link>
            <Link
              href="/facilities"
              className="rounded-full border border-white/25 px-8 py-3.5 text-base font-semibold hover:bg-white/10"
            >
              Explore Facilities
            </Link>
          </div>

          <p className="mt-10 text-sm text-white/60">
            📍 {config.location}
          </p>
        </div>
        <div className="h-1.5 gradient-brand" />
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
        <h2 className="display text-center text-4xl text-navy sm:text-5xl">
          Everything the game <span className="gradient-text">demands</span>
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card-lift rounded-2xl border border-navy/10 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-brand text-2xl" aria-hidden="true">
                {f.icon}
              </div>
              <h3 className="display mt-4 text-xl text-navy">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-navy/70">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sport split */}
      <section className="bg-navy/[0.03] py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 md:grid-cols-2">
          <div className="card-lift overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-navy/10">
            <PhotoPlaceholder label="Cricket ground aerial" className="h-56" variant="field" />
            <div className="p-6">
              <h3 className="display text-3xl text-navy">Cricket</h3>
              <p className="mt-2 text-sm leading-6 text-navy/70">
                Turf and artificial pitches, practice nets, and league-ready grounds —
                built by cricketers, for cricketers, with the Argyle Cricket Club.
              </p>
              <Link href="/cricket" className="mt-4 inline-block font-semibold text-sky hover:underline">
                Cricket at Infinity →
              </Link>
            </div>
          </div>
          <div className="card-lift overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-navy/10">
            <PhotoPlaceholder label="Soccer field at golden hour" className="h-56" variant="sky" />
            <div className="p-6">
              <h3 className="display text-3xl text-navy">Soccer</h3>
              <p className="mt-2 text-sm leading-6 text-navy/70">
                11v11 and 7v7 fields with pro-grade turf for matches, pickup games,
                youth leagues, and team training blocks.
              </p>
              <Link href="/soccer" className="mt-4 inline-block font-semibold text-sky hover:underline">
                Soccer at Infinity →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="gradient-brand">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-4 py-14 text-center text-white sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h2 className="display text-3xl sm:text-4xl">{config.tagline}</h2>
            <p className="mt-1 text-white/85">
              Hourly bookings, instant confirmation, self-service cancellations.
            </p>
          </div>
          <Link
            href="/book"
            className="rounded-full bg-white px-8 py-3.5 text-base font-bold uppercase tracking-wide text-navy transition-transform hover:-translate-y-0.5"
          >
            Reserve your slot
          </Link>
        </div>
      </section>
    </>
  );
}
