import Link from "next/link";
import PhotoPlaceholder from "@/components/PhotoPlaceholder";

export const metadata = { title: "Cricket" };

export default function CricketPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Cricket at <span className="gradient-text">Infinity</span>
      </h1>
      <p className="mt-3 max-w-2xl text-navy/70">
        Cricket is our first love. Built with the Argyle Cricket Club, our grounds
        are designed for serious league play and weekend tape-ball alike.
      </p>

      <PhotoPlaceholder label="Cricket ground panorama" className="mt-8 h-72 w-full" variant="field" />

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="display text-2xl text-navy">Formats supported</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-navy/80">
            <li>• T20 and T10 hard-ball matches (Ground 1, turf pitch)</li>
            <li>• Tape-ball and tennis-ball cricket (both grounds)</li>
            <li>• Net sessions — solo, pairs, or full team (4 enclosed lanes)</li>
            <li>• Coached sessions and youth programs (see Training)</li>
          </ul>
        </section>
        <section>
          <h2 className="display text-2xl text-navy">Venue rules</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-navy/80">
            <li>• Spiked shoes on turf pitch only; flats on artificial decks</li>
            <li>• Helmets required for hard-ball nets under 18</li>
            <li>• Teams bring their own match equipment; rentals at front desk</li>
            <li>• Signed waiver required for every player before first play</li>
          </ul>
        </section>
      </div>

      <div className="mt-10 rounded-2xl bg-navy p-6 text-white sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="display text-2xl">Ready to take the pitch?</h2>
          <p className="mt-1 text-sm text-white/70">Grounds from $50/hr · nets from $25/hr.</p>
        </div>
        <Link href="/book" className="btn-brand mt-4 inline-block rounded-full px-6 py-3 text-sm uppercase sm:mt-0">
          Book cricket
        </Link>
      </div>
    </div>
  );
}
