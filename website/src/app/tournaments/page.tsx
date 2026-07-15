import Link from "next/link";
import SiteImage from "@/components/SiteImage";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Tournaments & Events" };
export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  const upcoming = await prisma.tournament.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Tournaments &amp; <span className="gradient-text">Events</span>
      </h1>
      <p className="mt-3 max-w-2xl text-navy/70">
        Compete. Inspire. From league seasons to one-day cups, the park is built
        to host. Team registration opens as we approach launch.
      </p>

      <SiteImage slot="tournaments-hero" label="Tournaments at Infinity" className="mt-8 h-56 w-full" variant="field" />

      <div className="mt-10 space-y-5">
        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-navy/10 p-6 text-sm text-navy/60">
            No events are scheduled just yet — check back soon, or{" "}
            <Link href="/contact" className="font-semibold text-sky hover:underline">
              talk to us about hosting one
            </Link>
            .
          </p>
        ) : (
          upcoming.map((event) => (
            <div key={event.id} className="card-lift rounded-2xl border border-navy/10 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
              <div>
                <h2 className="display text-2xl text-navy">{event.name}</h2>
                <p className="mt-1 text-sm font-semibold text-pitch-deep">{event.timing}</p>
                <p className="mt-2 text-sm leading-6 text-navy/70">{event.description}</p>
              </div>
              <Link
                href="/contact"
                className="mt-4 inline-block shrink-0 rounded-full border border-navy/20 px-5 py-2.5 text-sm font-semibold text-navy hover:bg-navy/5 sm:mt-0"
              >
                {event.ctaLabel}
              </Link>
            </div>
          ))
        )}
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
