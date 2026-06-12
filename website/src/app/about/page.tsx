import Link from "next/link";
import { config } from "@/lib/config";
import PhotoPlaceholder from "@/components/PhotoPlaceholder";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Our <span className="gradient-text">Story</span>
      </h1>

      <div className="mt-8 grid gap-10 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5 text-navy/80 leading-7">
          <p>
            Infinity Sports Park was born from the <strong>Argyle Cricket Club</strong> —
            a community of players whose motto says it all: <em>&ldquo;Cricket is our
            first love.&rdquo;</em> What started as a search for a reliable home ground
            grew into something bigger: a premium multi-sport destination for the
            whole North Texas community.
          </p>
          <p>
            Opening <strong>Summer 2026</strong>, just 10 minutes from Argyle
            Chowrastha, the park brings together championship-quality cricket
            grounds, regulation soccer fields, enclosed practice nets, and a
            year-round training facility — all bookable by the hour, online,
            in seconds.
          </p>
          <p>
            Our promise is on the logo: <strong>{config.tagline}</strong>. Whether
            you&apos;re chasing a league title or chasing your kids around the
            boundary rope, there&apos;s a place for you here.
          </p>
          <p className="font-semibold uppercase tracking-widest text-navy">
            Play • Train • Compete • Inspire
          </p>
        </div>
        <div className="space-y-4">
          <PhotoPlaceholder label="The grounds, summer 2026" className="h-48" variant="field" />
          <PhotoPlaceholder label="Argyle Cricket Club" className="h-48" variant="navy" />
        </div>
      </div>

      {/* Location */}
      <section className="mt-12 rounded-2xl border border-navy/10 p-6">
        <h2 className="display text-2xl text-navy">Find us</h2>
        <p className="mt-2 text-sm text-navy/70">{config.location}.</p>
        <div className="mt-4 flex h-64 items-center justify-center rounded-xl bg-navy/5 text-sm text-navy/50">
          {/* Swap for an embedded Google Map once the street address is final — README §Domain & launch */}
          Interactive map coming soon — exact address announced closer to launch.
        </div>
        <p className="mt-3 text-sm text-navy/70">
          Questions in the meantime?{" "}
          <Link href="/contact" className="font-semibold text-sky hover:underline">
            Contact us →
          </Link>
        </p>
      </section>
    </div>
  );
}
