import Link from "next/link";
import SiteImage from "@/components/SiteImage";
import { minRateBySport } from "@/lib/rates";
import { formatCents } from "@/lib/pricing";
import { getSettings, isEnabled } from "@/lib/settings";

export const metadata = { title: "Soccer" };

export default async function SoccerPage() {
  const [min, settings] = await Promise.all([minRateBySport(), getSettings()]);
  const comingSoon = isEnabled(settings["soccer.comingSoon"]);
  const priceLine =
    min.SOCCER !== undefined ? `Fields from ${formatCents(min.SOCCER)}/hr` : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Soccer at <span className="gradient-text">Infinity</span>
      </h1>
      <p className="mt-3 max-w-2xl text-navy/70">
        Match-quality grass, fresh lines, and full-size goals — for league matches,
        pickup games, youth development, and team training.
      </p>

      {comingSoon && (
        <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <span className="font-bold uppercase tracking-wide">Coming soon</span>
          <span className="ml-2">{settings["soccer.bannerText"]}</span>
        </div>
      )}

      <SiteImage slot="soccer-hero" label="Soccer field with goal" className="mt-8 h-72 w-full" variant="sky" />

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

      {/* Long-term lease enquiry for clubs */}
      <div className="mt-10 rounded-2xl border border-navy/10 bg-navy/[0.03] p-6 sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="display text-2xl text-navy">Clubs & long-term lease</h2>
          <p className="mt-1 max-w-xl text-sm text-navy/70">{settings["soccer.leaseText"]}</p>
        </div>
        <a
          href={`mailto:${settings["soccer.leaseEmail"]}?subject=${encodeURIComponent(
            "Soccer long-term lease enquiry"
          )}`}
          className="mt-4 inline-block shrink-0 rounded-full border border-navy/20 px-6 py-3 text-sm font-semibold text-navy hover:bg-navy/5 sm:mt-0"
        >
          Enquire about a lease
        </a>
      </div>

      <div className="mt-6 rounded-2xl bg-navy p-6 text-white sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="display text-2xl">Get your squad on the grass</h2>
          {priceLine && (
            <p className="mt-1 text-sm text-white/70">{priceLine} · weekend slots fill fast.</p>
          )}
        </div>
        <Link href="/book" className="btn-brand mt-4 inline-block rounded-full px-6 py-3 text-sm uppercase sm:mt-0">
          Book soccer
        </Link>
      </div>
    </div>
  );
}
