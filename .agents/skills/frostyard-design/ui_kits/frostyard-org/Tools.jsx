const { Button: FyBtn, Eyebrow: FyEyebrow } = window.FrostyardDesignSystem_375ef6;

const fyTools = [
  { name: "updex", label: "System extension manager", mark: "UX", title: "Extensions, with a proper control surface.", body: "A Go CLI and SDK for discovering, enabling, updating, and retiring systemd-sysext features. It reads ordinary transfer definitions, verifies published artifacts, and keeps version retention bounded.", points: ["Feature and component discovery", "SHA256 manifests and optional GPG verification", "Retry-aware downloads and automatic decompression", "CLI, JSON output, and Go SDK"], command: "updex features  ·  updex enable podman --now", href: "https://github.com/frostyard/updex" },
  { name: "ChairLift", label: "Desktop system workspace", mark: "CL", title: "A quiet cockpit for a layered system.", body: "A GTK 4 desktop application for keeping a Snow workstation in shape. It puts staged system updates, Homebrew, Flatpak, package health, and extension features in one deliberate place.", points: ["Stage and inspect operating system updates", "Manage Homebrew packages and trusted taps", "Work with Flatpak and extension features", "System health and maintenance shortcuts"], command: "chairlift", href: "https://github.com/frostyard/chairlift" },
];

function FyTools() {
  return <div>
    <header style={{ padding: "7rem 0 5.5rem", maxWidth: 820 }}>
      <FyEyebrow>Tools for the layers</FyEyebrow>
      <h1 style={{ fontSize: "clamp(3.7rem,6vw,6.4rem)", lineHeight: .95, letterSpacing: "-.075em", margin: 0, fontWeight: 700 }}>Keep the base still.<br /><em style={{ fontFamily: "var(--font-serif-accent)", fontWeight: 400, color: "var(--ice)" }}>Move with intent.</em></h1>
      <p style={{ fontSize: "1.08rem", color: "var(--mist)", maxWidth: 580, margin: "2rem 0 0" }}>Frostyard tools make an immutable system practical: manage the extensions around the OS, and give the desktop a clear place to maintain itself.</p>
    </header>
    <section style={{ display: "grid", gap: "1rem" }}>
      {fyTools.map((tool, index) => <article key={tool.name} style={{ background: index ? "linear-gradient(135deg,#123b55,#0a1b2b)" : "linear-gradient(135deg,#0e3049,#081b2c)", border: "1px solid var(--line)", padding: "2.2rem 2.4rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: "1rem", borderBottom: "1px solid var(--line)", paddingBottom: "1.6rem" }}>
          <div style={{ display: "grid", placeItems: "center", width: 48, height: 48, border: "1px solid #aee9ff80", background: "#135477", borderRadius: "50%", fontWeight: 800, fontSize: ".75rem", color: "var(--ice)" }}>{tool.mark}</div>
          <div>
            <p style={{ fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".15em", color: "#84bed5", margin: 0 }}>{tool.label}</p>
            <h2 style={{ fontSize: "2rem", lineHeight: 1, letterSpacing: "-.06em", margin: ".2rem 0 0" }}>{tool.name}</h2>
          </div>
          <a href={tool.href} style={{ fontSize: "1.4rem", color: "var(--ice)", textDecoration: "none" }}>↗</a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: "4rem", padding: "2.2rem 0" }}>
          <div>
            <h3 style={{ fontSize: "1.45rem", letterSpacing: "-.04em", margin: "0 0 .7rem" }}>{tool.title}</h3>
            <p style={{ fontSize: ".93rem", color: "var(--mist)", margin: "0 0 1.5rem" }}>{tool.body}</p>
            <code style={{ fontFamily: "var(--font-mono)", fontSize: ".73rem", color: "#8ddbf8", background: "#061826", padding: ".55rem .7rem", display: "inline-block" }}>{tool.command}</code>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {tool.points.map(point => <li key={point} style={{ borderTop: "1px solid var(--line)", padding: ".75rem 0", color: "#c0dce9", fontSize: ".85rem" }}><span style={{ color: "#67cdf3", fontSize: ".63rem", marginRight: ".6rem" }}>✦</span>{point}</li>)}
          </ul>
        </div>
        <a href={tool.href} style={{ fontSize: ".8rem", fontWeight: 700, color: "#93e0fb", textDecoration: "none" }}>Inspect {tool.name} <span style={{ marginLeft: ".3rem" }}>↗</span></a>
      </article>)}
    </section>
    <section style={{ margin: "7rem 0 5rem", borderTop: "1px solid var(--line)", paddingTop: "3rem", display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: "4rem", alignItems: "end" }}>
      <div style={{ gridColumn: "1/-1" }}><FyEyebrow style={{ margin: 0 }}>Different jobs, shared direction</FyEyebrow></div>
      <h2 style={{ fontSize: "clamp(2rem,3.3vw,3.5rem)", lineHeight: 1, letterSpacing: "-.06em", margin: 0, fontWeight: 700 }}>Updex handles the extension layer.<br />ChairLift makes that layer approachable.</h2>
      <p style={{ color: "var(--mist)", fontSize: ".93rem", margin: 0 }}>Both leave the operating system image intact. That is the point: capabilities can change without turning the base into an accumulation of exceptions.</p>
    </section>
  </div>;
}
window.FyTools = FyTools;