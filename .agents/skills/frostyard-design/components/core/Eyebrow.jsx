export function Eyebrow({ children, style }) {
  return <p style={{ fontSize: "var(--text-eyebrow-size)", textTransform: "uppercase", letterSpacing: "var(--text-eyebrow-ls)", fontWeight: 700, color: "var(--text-eyebrow)", margin: "0 0 1.1rem", fontFamily: "var(--font-sans)", ...style }}>
    <span style={{ width: "var(--eyebrow-dash-w)", height: 1, background: "var(--sky)", display: "inline-block", verticalAlign: "middle", marginRight: ".6rem" }}></span>{children}</p>;
}