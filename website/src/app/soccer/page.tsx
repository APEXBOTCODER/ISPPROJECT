import Link from "next/link";
import PhotoPlaceholder from "@/components/PhotoPlaceholder";

export const metadata = { title: "Soccer" };

export default function SoccerPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Soccer at <span className="gradient-text">Infinity</span>
      </h1>
      <p className="mt-3 max-w-2xl text-navy/70">
        Match-quality grass, fresh lines, and full-size goals — for league matches,
        pickup games, youth development, and team training.
      </p>

      <PhotoPlaceholder label="Soccer field with goal" className="mt-8 h-72 w-full" variant="sky" />

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="display text-2xl text-navy">Field options</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-navy/80">
            <li>• Field 1 — regulation 11v11, premium Bermuda grass</li>
            <li>• Field 2 — 7v7 small-sided, ideal for youth and pickup</li>
            <li>• Corner flags, nets, and match balls available at the desk</li>
            <li>• Evening floodlights (peak-rate hours)</li>
          </ul>
        </section>
        <section>
          <h2 className="display text-2xl text-navy">Venue rules</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-navy/80">
            <li>• Firm-ground or turf boots; no metal studs on 7v7 field</li>
            <li>• No food, gum, or colored drinks on playing surfaces</li>
            <li>• Teams must vacate at the end of the booked hour</li>
            <li>• Signed waiver required for every player before first play</li>
          </ul>
        </section>
      </div>

      <div className="mt-10 rounded-2xl bg-navy p-6 text-white sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="display text-2xl">Get your squad on the grass</h2>
          <p className="mt-1 text-sm text-white/70">Fields from $45/hr · weekend slots fill fast.</p>
        </div>
        <Link href="/book" className="btn-brand mt-4 inline-block rounded-full px-6 py-3 text-sm uppercase sm:mt-0">
          Book soccer
        </Link>
      </div>
    </div>
  );
}
