import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";

export const metadata = { title: "Membership & Pricing" };

export default async function PricingPage() {
  const resources = await prisma.resource.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Membership &amp; <span className="gradient-text">Pricing</span>
      </h1>
      <p className="mt-3 max-w-2xl text-navy/70">
        Simple hourly rates. Peak pricing applies weekday evenings (from 5pm) and
        all day on weekends. No hidden fees — the price you see at checkout is
        the price you pay.
      </p>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-navy/10">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-5 py-3.5 font-semibold">Facility</th>
              <th className="px-5 py-3.5 font-semibold">Hours</th>
              <th className="px-5 py-3.5 font-semibold">Off-peak / hr</th>
              <th className="px-5 py-3.5 font-semibold">Peak / hr ⚡</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r, i) => (
              <tr key={r.id} className={i % 2 ? "bg-navy/[0.03]" : ""}>
                <td className="px-5 py-3.5 font-medium text-navy">{r.name}</td>
                <td className="px-5 py-3.5 text-navy/70">{r.openHour}:00–{r.closeHour}:00</td>
                <td className="px-5 py-3.5 text-navy/80">{formatCents(r.baseRate)}</td>
                <td className="px-5 py-3.5 font-semibold text-pitch-deep">{formatCents(r.peakRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-navy/10 p-6">
          <h2 className="display text-2xl text-navy">Member tiers</h2>
          <p className="mt-2 text-sm leading-6 text-navy/70">
            Member discounts, hour packages (buy 10, save 15%), and team season
            passes launch with the park in Summer 2026. Founding-member pricing
            will be announced first to the mailing list.
          </p>
        </div>
        <div className="rounded-2xl border border-navy/10 p-6">
          <h2 className="display text-2xl text-navy">Cancellation policy</h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-navy/70">
            <li>• 48+ hours before start — <strong>full refund</strong></li>
            <li>• 24–48 hours — <strong>50% refund</strong></li>
            <li>• Inside 24 hours — no refund</li>
          </ul>
          <p className="mt-2 text-xs text-navy/50">
            Cancel anytime from your dashboard. Refunds are automatic.
          </p>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link href="/book" className="btn-brand rounded-full px-8 py-3.5 text-base uppercase tracking-wide">
          See live availability
        </Link>
      </div>
    </div>
  );
}
