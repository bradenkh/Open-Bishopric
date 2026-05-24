interface LDSChurchIconProps {
  className?: string;
}

/**
 * Custom SVG icon of an LDS meetinghouse / church building.
 *
 * Designed to be a drop-in replacement for lucide-react icons —
 * pass a Tailwind className (e.g. "h-6 w-6 text-primary") to size and colour it.
 */
export function LDSChurchIcon({ className }: LDSChurchIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="LDS church building"
      className={className}
    >
      {/* ── Spire finial (thin pin above the triangle) ── */}
      <line x1="12" y1="0.75" x2="12" y2="2.5" />

      {/* ── Spire triangle ── */}
      <polyline points="9.5,5.5 12,2.5 14.5,5.5" />

      {/* ── Steeple tower ── */}
      <rect x="10.5" y="5.5" width="3" height="3.5" />

      {/* ── Main building body ── */}
      <rect x="3" y="9" width="18" height="9" />

      {/* ── Left arched window ── */}
      {/* M = move to bottom-left; V = go up; Q = quadratic arc; V = go back down */}
      <path d="M4.5 16 V14 Q6 12.5 7.5 14 V16" />

      {/* ── Right arched window ── */}
      <path d="M16.5 16 V14 Q18 12.5 19.5 14 V16" />

      {/* ── Central arched door ── */}
      <path d="M10.5 18 V15.5 Q12 13.5 13.5 15.5 V18" />

      {/* ── Steps (wider than building, two tiers) ── */}
      {/*
        Starts at building bottom-left corner, steps out-and-down on each side,
        then runs along the ground and mirrors back up on the right.
      */}
      <path d="M3 18 H1.5 V20 H0.5 V22 H23.5 V20 H22.5 V18 H21" />
    </svg>
  );
}
