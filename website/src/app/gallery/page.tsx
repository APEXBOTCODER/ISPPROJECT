import PhotoPlaceholder from "@/components/PhotoPlaceholder";

export const metadata = { title: "Gallery" };

const shots: { label: string; variant: "field" | "sky" | "navy"; tall?: boolean }[] = [
  { label: "Aerial — full park", variant: "field", tall: true },
  { label: "Cricket Ground 1 turf pitch", variant: "field" },
  { label: "Soccer Field 1 at sunset", variant: "sky" },
  { label: "Practice net lanes", variant: "navy" },
  { label: "Training facility interior", variant: "navy", tall: true },
  { label: "Family zone & seating", variant: "sky" },
  { label: "Opening day rendering", variant: "field" },
  { label: "Argyle Cricket Club squad", variant: "navy" },
];

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="display text-5xl text-navy">
        <span className="gradient-text">Gallery</span>
      </h1>
      <p className="mt-3 max-w-2xl text-navy/70">
        Construction is underway — professional photography and drone footage land
        here as the park takes shape. Placeholders below show the planned shots.
      </p>

      <div className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
        {shots.map((s) => (
          <PhotoPlaceholder
            key={s.label}
            label={s.label}
            variant={s.variant}
            className={s.tall ? "h-80 break-inside-avoid" : "h-52 break-inside-avoid"}
          />
        ))}
      </div>
    </div>
  );
}
