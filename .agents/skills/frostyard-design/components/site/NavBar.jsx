export function NavBar({ links = [["Base","/base"],["Images","#images"],["Extensions","#extensions"],["Why Atomic","/why-atomic"],["Tools","/tools"]], current, sourceLabel = "Source", sourceHref = "https://github.com/frostyard/snosi", onNavigate }) {
  return <nav style={{ height: "var(--nav-height)", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--line)", fontFamily: "var(--font-sans)" }}>
    <a href="#top" onClick={onNavigate && (e => { e.preventDefault(); onNavigate("home"); })} style={{ fontWeight: 720, letterSpacing: "-.04em", fontSize: "1.25rem", color: "var(--text-body)", textDecoration: "none", whiteSpace: "nowrap" }}>
      <span style={{ color: "var(--ice)", fontSize: "1.55rem", marginRight: ".3rem" }}>❄</span> frostyard</a>
    <div style={{ display: "flex", gap: "2rem", fontSize: ".87rem", color: "#b7d0df" }}>
      {links.map(([label, href]) => <a key={label} href={href}
        onClick={onNavigate && (e => { e.preventDefault(); onNavigate(href); })}
        style={{ color: current === label ? "var(--ice)" : "inherit", textDecoration: "none" }}
        onMouseEnter={e => e.target.style.color = "var(--ice)"}
        onMouseLeave={e => e.target.style.color = current === label ? "var(--ice)" : "#b7d0df"}>{label}</a>)}
    </div>
    <a href={sourceHref} style={{ fontSize: ".83rem", border: "1px solid var(--line)", padding: ".55rem .8rem", borderRadius: "var(--radius-pill)", color: "#d9f2ff", textDecoration: "none" }}>{sourceLabel} <span style={{ color: "var(--ice)", marginLeft: ".35rem" }}>↗</span></a>
  </nav>;
}