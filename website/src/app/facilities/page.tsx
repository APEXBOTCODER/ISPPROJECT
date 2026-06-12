import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/pricing";
import PhotoPlaceholder from "@/components/PhotoPlaceholder";

export const metadata = { title: "Facilities" };

const sportVariant: Record<string, "field" | "sky" | "navy"> = {
  CRICKET: "field",
  SOCCER: "sky",
  NETS: "navy",
  TRAINING: "navy",
};

export default async function FacilitiesPage() {
  const resources = await prisma.resource.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        Our <span className="gradient-text">Facilities</span>
      </h1>
      <p className="mt-3 max-w-2xl text-navy/70">
        Every field, net, and training space is independently bookable by the
        hour, with real-time availability. Open daily — see each facility for hours.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {resources.map((r) => (
          <div key={r.id} className="card-lift flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-navy/10">
            <PhotoPlaceholder label={r.name} className="h-44" variant={sportVariant[r.sport] ?? "field"} />
            <div className="flex flex-1 flex-col p-5">
              <h2 className="display text-2xl text-navy">{r.name}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-navy/70">{r.description}</p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-navy/60">
                  {r.openHour}:00–{r.closeHour}:00 daily
                </span>
                <span className="font-bold text-pitch-deep">
                  from {formatCents(r.baseRate)}/hr
                </span>
              </div>
              <Link
                href="/book"
                className="btn-brand mt-4 rounded-md px-4 py-2 text-center text-sm uppercase tracking-wide"
              >
                Check availability
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
