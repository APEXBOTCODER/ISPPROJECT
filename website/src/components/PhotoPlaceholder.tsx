// Branded stand-in for facility photography. When real photos arrive, drop
// them in /public/images and replace usages with <Image> — see README §Photography.
export default function PhotoPlaceholder({
  label,
  className = "",
  variant = "field",
}: {
  label: string;
  className?: string;
  variant?: "field" | "sky" | "navy";
}) {
  const gradients = {
    field: "from-pitch-deep via-pitch to-sky",
    sky: "from-sky-deep via-sky to-pitch",
    navy: "from-navy-deep via-navy to-sky-deep",
  };
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative flex items-end overflow-hidden rounded-2xl bg-gradient-to-br ${gradients[variant]} ${className}`}
    >
      {/* turf line pattern */}
      <svg className="absolute inset-0 h-full w-full opacity-15" aria-hidden="true">
        <defs>
          <pattern id={`stripes-${variant}`} width="48" height="48" patternUnits="userSpaceOnUse">
            <rect width="24" height="48" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#stripes-${variant})`} />
      </svg>
      <span className="relative m-3 rounded-md bg-black/30 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
        {label} · photo coming soon
      </span>
    </div>
  );
}
