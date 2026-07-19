interface BrandMarkProps {
  /** Lado en px del SVG cuadrado. Hereda el color vía currentColor. */
  size?: number;
}

/** Balanza de Jurco (misma geometría que el favicon), en trazo. */
export function BrandMark({ size = 24 }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="16" y1="7" x2="16" y2="24" />
      <line x1="11" y1="25" x2="21" y2="25" />
      <line x1="8" y1="10" x2="24" y2="10" />
      <line x1="8" y1="10" x2="5" y2="15" />
      <line x1="8" y1="10" x2="11" y2="15" />
      <line x1="24" y1="10" x2="21" y2="15" />
      <line x1="24" y1="10" x2="27" y2="15" />
      <path d="M4 15 a4 4 0 0 0 8 0" />
      <path d="M20 15 a4 4 0 0 0 8 0" />
    </svg>
  );
}
