interface BishopricIconProps {
  className?: string;
}

/**
 * Custom SVG icon: bishop + two counselors in suits behind a sacrament table.
 * Drop-in Lucide-style icon — pass Tailwind className for size & colour.
 */
export function BishopricIcon({ className }: BishopricIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Bishopric"
      className={className}
    >
      {/* ─── Left counselor (slightly behind) ─── */}
      {/* Head */}
      <circle cx="6" cy="10" r="2.2" />
      {/* Hair arc */}
      <path d="M3.9 9.1 Q6 7.3 8.1 9.1" />
      {/* Left shoulder */}
      <path d="M3.5 16.5 Q3.5 13 6 12.3" />
      {/* Right shoulder */}
      <path d="M8.5 16.5 Q8.5 13 6 12.3" />
      {/* Left lapel */}
      <path d="M6 12.3 L5.1 14.2" />
      {/* Right lapel */}
      <path d="M6 12.3 L6.9 14.2" />
      {/* Tie */}
      <path d="M5.5 14.2 L6 16.3 L6.5 14.2" />

      {/* ─── Right counselor (slightly behind) ─── */}
      {/* Head */}
      <circle cx="18" cy="10" r="2.2" />
      {/* Hair arc */}
      <path d="M15.9 9.1 Q18 7.3 20.1 9.1" />
      {/* Left shoulder */}
      <path d="M15.5 16.5 Q15.5 13 18 12.3" />
      {/* Right shoulder */}
      <path d="M20.5 16.5 Q20.5 13 18 12.3" />
      {/* Left lapel */}
      <path d="M18 12.3 L17.1 14.2" />
      {/* Right lapel */}
      <path d="M18 12.3 L18.9 14.2" />
      {/* Tie */}
      <path d="M17.5 14.2 L18 16.3 L18.5 14.2" />

      {/* ─── Bishop (center, taller / larger) ─── */}
      {/* Head */}
      <circle cx="12" cy="7.8" r="2.7" />
      {/* Hair arc */}
      <path d="M9.5 6.8 Q12 4.9 14.5 6.8" />
      {/* Left shoulder */}
      <path d="M8.5 16.5 Q8.5 11.8 12 11" />
      {/* Right shoulder */}
      <path d="M15.5 16.5 Q15.5 11.8 12 11" />
      {/* Left lapel */}
      <path d="M12 11 L10.5 13.8" />
      {/* Right lapel */}
      <path d="M12 11 L13.5 13.8" />
      {/* Tie */}
      <path d="M11.3 13.8 L12 16.5 L12.7 13.8" />

      {/* ─── Sacrament table / desk ─── */}
      <rect x="0.5" y="16.5" width="23" height="5.5" rx="2.5" />
    </svg>
  );
}
