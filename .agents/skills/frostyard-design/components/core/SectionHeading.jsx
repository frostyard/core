import { Eyebrow } from "./Eyebrow.jsx";
export function SectionHeading({ eyebrow, title, lede, compact, style }) {
  return <div style={{ maxWidth: 670, ...style }}>
    {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
    <h2 style={{ fontSize: compact ? "clamp(2.3rem,3.8vw,3.8rem)" : "var(--text-h2-size)", letterSpacing: "var(--text-h2-ls)", lineHeight: 1, margin: ".25rem 0 1.25rem", color: "var(--text-body)", fontFamily: "var(--font-sans)", fontWeight: 700 }}>{title}</h2>
    {lede && <p style={{ color: "var(--text-dim)", fontSize: ".91rem", margin: 0 }}>{lede}</p>}
  </div>;
}