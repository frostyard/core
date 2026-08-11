export function Button({ variant = "primary", href = "#", children, glyph, onClick, style }) {
  const base = { display: "inline-flex", alignItems: "center", padding: ".75rem 1rem", borderRadius: "var(--radius-button)", fontSize: ".86rem", fontWeight: 650, textDecoration: "none", fontFamily: "var(--font-sans)", cursor: "pointer", whiteSpace: "nowrap" };
  const variants = {
    primary: { background: "var(--gradient-primary)", color: "var(--on-primary)" },
    ghost: { border: "1px solid var(--line)", color: "#d8edf7", background: "transparent" },
  };
  return <a href={href} onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>{children}{glyph && <span style={{ color: variant === "primary" ? "var(--on-primary)" : "var(--ice)", marginLeft: ".35rem" }}>{glyph}</span>}</a>;
}