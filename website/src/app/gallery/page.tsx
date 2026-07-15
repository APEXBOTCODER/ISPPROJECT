import SiteImage from "@/components/SiteImage";

export const metadata = { title: "Gallery" };

const shots: {
  slot: string;
  label: string;
  variant: "field" | "sky" | "navy";
  tall?: boolean;
}[] = [
  { slot: "gallery-1", label: "Aerial — full park", variant: "field", tall: true },
  { slot: "gallery-2", label: "Cricket Ground 1 turf pitch", variant: "field" },
  { slot: "gallery-3", label: "Soccer Field 1 at sunset", variant: "sky" },
  { slot: "gallery-4", label: "Practice net lanes", variant: "navy" },
  { slot: "gallery-5", label: "Training facility interior", variant: "navy", tall: true },
  { slot: "gallery-6", label: "Family zone & seating", variant: "sky" },
  { slot: "gallery-7", label: "Opening day rendering", variant: "field" },
  { slot: "gallery-8", label: "Argyle Cricket Club squad", variant: "navy" },
];

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        <span className="gradient-text">Gallery</span>
      </h1>
      <p className="mt-3 max-w-2xl text-navy/70">
        Construction is underway — professional photography and drone footage land
        here as the park takes shape. Placeholders show the planned shots until the
        photos are published.
      </p>

      <div className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
        {shots.map((s) => (
          <SiteImage
            key={s.slot}
            slot={s.slot}
            label={s.label}
            variant={s.variant}
            className={`w-full ${s.tall ? "h-80" : "h-52"} break-inside-avoid`}
          />
        ))}
      </div>
    </div>
  );
}
