// The green→blue infinity loop from the logo, drawn as an animated SVG.
// Swap for the production vector asset when final brand files arrive.
export default function InfinityMark({
  className = "h-10 w-auto",
  animate = false,
}: {
  className?: string;
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 120 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="loopGrad" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5CB82A" />
          <stop offset="0.5" stopColor="#4C9A2A" />
          <stop offset="1" stopColor="#1E6FD9" />
        </linearGradient>
      </defs>
      <path
        d="M30 8 C14 8 8 18 8 28 C8 38 14 48 30 48 C46 48 52 38 60 28 C68 18 74 8 90 8 C106 8 112 18 112 28 C112 38 106 48 90 48 C74 48 68 38 60 28 C52 18 46 8 30 8 Z"
        stroke="url(#loopGrad)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      {animate && (
        <path
          d="M30 8 C14 8 8 18 8 28 C8 38 14 48 30 48 C46 48 52 38 60 28 C68 18 74 8 90 8 C106 8 112 18 112 28 C112 38 106 48 90 48 C74 48 68 38 60 28 C52 18 46 8 30 8 Z"
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="3"
          strokeLinecap="round"
          className="infinity-animate"
        />
      )}
    </svg>
  );
}
