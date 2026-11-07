// M6.3: HeadlessOS logo and wordmark
// EX8.33: the logo is the app's real icon (public/icons/app-logo.png, a copy of electron/icons/icon.png)
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

export function HeadlessOSLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return <img src="icons/app-logo.png" alt="HeadlessOS" width={size} height={size} draggable={false} className={className} />;
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
