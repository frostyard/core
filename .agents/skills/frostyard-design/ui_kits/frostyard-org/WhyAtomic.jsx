const { Eyebrow: WaEyebrow } = window.FrostyardDesignSystem_375ef6;

const waBreakages = [
  ["The convenient library install", "A project asks for one newer library. A system-wide package or a copied file changes an ABI beneath another tool. The original project works; the next update or unrelated application does not."],
  ["The one-off repository", "A third-party repository solves an immediate need, then quietly owns dependency decisions for the whole machine. Months later, a routine upgrade becomes a puzzle of pins and held packages."],
  ["The urgent host fix", "A service needs a runtime, a container engine, or a build stack. Installing it directly makes the host responsible for every library, daemon, and configuration that arrives alongside it."],
];
const waPaths = [
  ["Brew", "Personal, local tooling", "Use Homebrew for command-line tools and applications that belong to your own working environment. It keeps that choice in user-space rather than rewriting the image."],
  ["System extension", "A capability close to the host", "Use a Frostyard sysext when the tool needs to integrate with the operating system: development tools, VPNs, editors, Docker, Podman, or Incus."],
  ["Podman + Distrobox", "Development userspaces", "Use containers when a project needs its own distribution, language toolchain, or library set. The project gets its environment; the host stays legible."],
  ["Docker", "Application workloads", "Use Docker when an application already ships as a container workflow. The Docker extension adds that runtime without making it part of the base image."],
  ["Incus", "System containers and VMs", "Use Incus when the workload needs a fuller machine boundary: long-lived system containers, virtual machines, or a test environment with its own operating system."],
];

function FyWhyAtomic() {
  const h = { lineHeight: .95, letterSpacing: "-.075em", margin: 0, fontWeight: 700 };
  return <div>
    <header style={{ padding: "7rem 0 5.5rem", maxWidth: 900 }}>
      <WaEyebrow>Why atomic</WaEyebrow>
      <h1 style={{ ...h, fontSize: "clamp(3.3rem,6vw,6.3rem)" }}>Change the tool.<br /><em style={{ fontFamily: "var(--font-serif-accent)", fontWeight: 400, color: "var(--ice)" }}>Not the ground beneath it.</em></h1>
      <p style={{ fontSize: "1.08rem", color: "var(--mist)", maxWidth: 650, margin: "2rem 0 0" }}>Atomic systems keep the operating system as a coherent, replaceable unit. That makes ordinary work less fragile: software choices have a boundary, updates have a known shape, and recovery does not begin with archaeology.</p>
    </header>
    <section style={{ padding: "3.5rem", border: "1px solid var(--line)", background: "linear-gradient(135deg,#0f3048,#091c2d)", display: "grid", gridTemplateColumns: ".8fr 1.2fr", gap: "4rem", alignItems: "center" }}>
      <div aria-hidden="true" style={{ height: 180, border: "1px solid #9cdef955", display: "grid", placeContent: "center", textAlign: "center", background: "radial-gradient(circle,#237ca444,transparent 65%)" }}>
        <span style={{ font: "700 .75rem var(--font-mono)", letterSpacing: ".12em", color: "#d6f7ff", background: "#0d3450", padding: ".55rem .8rem", border: "1px solid #9cdef966" }}>OS image</span>
        <i style={{ height: 38, width: 1, background: "#78d7f4", display: "block", margin: "auto" }}></i>
        <b style={{ fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".13em", color: "#93dff7" }}>Tools & workloads</b>
      </div>
      <div>
        <WaEyebrow>The protection is architectural</WaEyebrow>
        <h2 style={{ fontSize: "clamp(2.25rem,3.8vw,4rem)", lineHeight: 1, letterSpacing: "-.06em", margin: 0, fontWeight: 700 }}>A stable host is a smaller blast radius.</h2>
        <p style={{ fontSize: ".93rem", color: "var(--mist)", margin: "1.3rem 0 0" }}>The base image is updated as one tested deployment rather than as a long history of package transactions. Your configuration and data persist separately. If an update is wrong, the prior deployment remains a clear path back.</p>
      </div>
    </section>
    <section style={{ padding: "7rem 0" }}>
      <WaEyebrow>What it avoids</WaEyebrow>
      <h2 style={{ fontSize: "clamp(2.25rem,3.8vw,4rem)", lineHeight: 1, letterSpacing: "-.06em", margin: 0, fontWeight: 700 }}>Normal systems break<br />in familiar ways.</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", marginTop: "3rem", borderTop: "1px solid var(--line)" }}>
        {waBreakages.map(([title, body], index) => <article key={title} style={{ padding: index ? "2.4rem 2rem" : "2.4rem 2rem 2.4rem 0", borderBottom: "1px solid var(--line)", borderLeft: index ? "1px solid var(--line)" : "none" }}>
          <b style={{ font: "400 .7rem var(--font-mono)", color: "var(--sky)" }}>0{index + 1}</b>
          <h3 style={{ fontSize: "1.15rem", margin: ".8rem 0" }}>{title}</h3>
          <p style={{ fontSize: ".88rem", color: "var(--mist)", margin: 0 }}>{body}</p>
        </article>)}
      </div>
    </section>
    <section style={{ padding: "5rem 0", borderTop: "1px solid var(--line)", display: "grid", gridTemplateColumns: ".85fr 1.15fr", gap: "5rem" }}>
      <div style={{ position: "sticky", top: "2rem", height: "max-content" }}>
        <WaEyebrow>Practical exits, not dead ends</WaEyebrow>
        <h2 style={{ fontSize: "clamp(2.25rem,3.8vw,4rem)", lineHeight: 1, letterSpacing: "-.06em", margin: 0, fontWeight: 700 }}>Put each dependency<br />at the right level.</h2>
        <p style={{ fontSize: ".93rem", color: "var(--mist)", margin: "1.3rem 0 0" }}>Immutable does not mean unable to install software. It means selecting the smallest boundary that fits the job.</p>
      </div>
      <div>
        {waPaths.map(([name, context, body], index) => <article key={name} style={{ display: "grid", gridTemplateColumns: "2.5rem 1fr", gap: "1rem", padding: "1.25rem 0", borderTop: "1px solid var(--line)", borderBottom: index === waPaths.length - 1 ? "1px solid var(--line)" : "none" }}>
          <b style={{ font: "400 .7rem var(--font-mono)", color: "var(--sky)" }}>0{index + 1}</b>
          <div>
            <h3 style={{ fontSize: "1.15rem", margin: 0 }}>{name}</h3>
            <p style={{ fontSize: ".67rem", textTransform: "uppercase", letterSpacing: ".12em", color: "#75c8e9", margin: ".3rem 0 .55rem" }}>{context}</p>
            <p style={{ fontSize: ".88rem", color: "var(--mist)", margin: 0 }}>{body}</p>
          </div>
        </article>)}
      </div>
    </section>
  </div>;
}
window.FyWhyAtomic = FyWhyAtomic;