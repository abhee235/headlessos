// M6.3: HeadlessOS Logo SVG — crisp monogram for branding
// @see docs/phases/phase-6.md

export function HeadlessOSLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer rounded square */}
      <rect x="4" y="4" width="92" height="92" rx="20" fill="url(#logo-grad)" />
      <rect x="4" y="4" width="92" height="92" rx="20" fill="url(#logo-shine)" />
      <rect x="4" y="4" width="92" height="92" rx="20" stroke="white" strokeOpacity="0.15" strokeWidth="1.5" />

      {/* H monogram */}
      <path
        d="M30 28v44M70 28v44M30 50h40"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Subtle inner glow */}
      <rect x="4" y="4" width="92" height="92" rx="20" fill="url(#logo-inner-glow)" />

      <defs>
        <linearGradient id="logo-grad" x1="4" y1="4" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="0.5" stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id="logo-shine" x1="50" y1="4" x2="50" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.12" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="logo-inner-glow" cx="50" cy="50" r="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.05" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function HeadlessOSWordmark({ width = 200, className = '' }: { width?: number; className?: string }) {
  const height = width * 0.3;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <text
        x="100"
        y="42"
        textAnchor="middle"
        fill="currentColor"
        fontSize="34"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        letterSpacing="-0.5"
      >
        HeadlessOS
      </text>
    </svg>
  );
}
