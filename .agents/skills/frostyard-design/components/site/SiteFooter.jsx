export function SiteFooter({ tagline = "Cold systems. Clear boundaries.", linkLabel = "github.com/frostyard/snosi ↗", linkHref = "https://github.com/frostyard/snosi" }) {
  return <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text-footer)", fontSize: ".8rem", paddingBottom: "3rem", fontFamily: "var(--font-sans)" }}>
    <a href="#top" style={{ fontWeight: 720, letterSpacing: "-.04em", fontSize: "1.25rem", color: "var(--text-body)", textDecoration: "none", whiteSpace: "nowrap" }}><span style={{ color: "var(--ice)", fontSize: "1.55rem", marginRight: ".3rem" }}>❄</span> frostyard</a>
    <p style={{ margin: 0 }}>{tagline}</p>
    <a href={linkHref} style={{ color: "#a4d9ef", textDecoration: "none" }}>{linkLabel}</a>
  </footer>;
}