/** Frostyard CTA button. @startingPoint section="Core" subtitle="Primary gradient and ghost hairline CTAs" viewport="360x120" */
export interface ButtonProps {
  /** "primary" (cyan gradient, dark text) or "ghost" (hairline) */
  variant?: "primary" | "ghost";
  href?: string;
  /** trailing glyph: "↗" external, "↓" in-page */
  glyph?: string;
  onClick?: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}