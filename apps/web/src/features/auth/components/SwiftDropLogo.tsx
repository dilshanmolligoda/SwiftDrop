interface SwiftDropLogoProps {
  className?: string;
  size?: number;
}

export function SwiftDropLogo({ className, size = 26 }: SwiftDropLogoProps) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        userSelect: 'none',
      }}
    >
      {/* Isometric 3D Parcel Box Icon matching Figma */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        {/* Top rhombus face */}
        <path
          d="M12 2.5L20 7L12 11.5L4 7L12 2.5Z"
          stroke="#0e5330"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        {/* Left vertical edge and bottom */}
        <path
          d="M4 7V17L12 21.5V11.5"
          stroke="#0e5330"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        {/* Right vertical edge and bottom */}
        <path
          d="M20 7V17L12 21.5"
          stroke="#0e5330"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        {/* Top box tape/fold detail */}
        <path
          d="M8 4.75L16 9.25"
          stroke="#0e5330"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <span
        style={{
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: '20px',
          fontWeight: 700,
          color: '#111827',
          letterSpacing: '-0.3px',
        }}
      >
        SwiftDrop
      </span>
    </div>
  );
}

