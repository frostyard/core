/** Eyebrow + oversized h2 + optional lede — the standard section opener. */
export interface SectionHeadingProps {
  eyebrow?: string;
  /** pass <>Two beats.<br/>Second line.</> for the signature two-line break */
  title: React.ReactNode;
  lede?: string;
  /** smaller clamp for in-panel headings */
  compact?: boolean;
  style?: React.CSSProperties;
}