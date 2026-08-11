const { Button, Eyebrow, Tag, SectionHeading, ImageCard } = window.FrostyardDesignSystem_375ef6;

const fyImages = [
  { type: "Desktop", name: "snow", title: "A GNOME workstation that stays composed.", body: "A daily desktop built on Debian Trixie with a current backports kernel, atomic OS updates, and room for real work.", tags: ["GNOME", "Backports kernel", "Atomic updates"] },
  { type: "Surface", name: "snowfield", title: "Snow, tuned for Surface hardware.", body: "The Snow desktop with linux-surface and the hardware support that makes a tablet or laptop feel like a first-class machine.", tags: ["GNOME", "linux-surface", "Touch-ready"] },
  { type: "Server", name: "cayo", title: "A quiet base for services and containers.", body: "A headless image for servers, labs, and small infrastructure. Podman is ready; the host stays deliberately uninteresting.", tags: ["Headless", "Containers", "Virtualization"] },
];
const fyGroups = [
  ["Workstation", [["1Password desktop","8.12.26"],["Bitwarden","2026.6.1"],["Claude Desktop","1.18286.2"],["Microsoft Edge","150.0.4078.48-1"],["Visual Studio Code","1.127.0-1782814776"]]],
  ["Development", [["Development tools","12.12"],["Debian development","1.0.141"],["Nix","2.26.3+dfsg-1"],["Podman + Distrobox","5.4.2+ds1-2+b2"],["Docker CE","5+29.4.1-1~debian.13~trixie"]]],
  ["Infrastructure", [["Tailscale","1.98.3"],["Azure VPN","3.0.0"],["Incus","1+7.2-debian13-202607011341+r1"],["Coder","2.34.6-1"],["code-server","4.118.0"],["Lemonade","10.10.0~13"]]],
  ["Also published", [["1Password CLI","2.33.1-1"],["Emdash","0.4.50"],["Himmelblau","4.0.0-debian13~20260514"]]],
];
const fyPrinciples = [
  ["01","Atomic by default","Update the whole operating system as a coherent image. Reboot into the new deployment; keep the previous one available."],
  ["02","Mutable where it counts","Your data, configuration, containers, and projects live in persistent writable storage. The operating system does not get in their way."],
  ["03","Tools without drift","Add capabilities as system extensions, containers, or user-space package environments instead of turning the base into a snowball."],
];
const fyLanes = [
  ["01","System extension","For a tool that belongs close to the OS: VPNs, IDEs, container runtimes, and services."],
  ["02","Container or Distrobox","For development stacks and workloads that should bring their own userspace."],
  ["03","User-space environment","For personal tooling with Nix, Homebrew, Flatpak, or a project-local runtime."],
];

function FyHome() {
  return <div>
    <section style={{ minHeight: 560, display: "grid", gridTemplateColumns: "1.1fr .9fr", alignItems: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ padding: "6rem 0" }}>
        <Eyebrow>Debian · mkosi · bootc or A/B root</Eyebrow>
        <h1 style={{ fontSize: "clamp(3.4rem,6.4vw,6.4rem)", lineHeight: .94, letterSpacing: "-.072em", margin: 0, maxWidth: 720, fontWeight: 700 }}>Keep the system<br /><em style={{ fontFamily: "var(--font-serif-accent)", fontWeight: 400, color: "var(--ice)" }}>boring.</em> Make the work interesting.</h1>
        <p style={{ fontSize: "1.08rem", color: "var(--text-muted)", maxWidth: 565, margin: "2rem 0 2.4rem" }}>Frostyard images are atomic, updateable operating systems for desktops and servers. A known-good base stays put; your tools arrive as deliberate layers.</p>
        <div style={{ display: "flex", gap: ".8rem" }}>
          <Button variant="primary" href="#images" glyph="↓">Explore images</Button>
          <Button variant="ghost" href="https://github.com/frostyard/snosi" glyph="↗">Read the build</Button>
        </div>
      </div>
      <div aria-hidden="true" style={{ height: 440, position: "relative" }}>
        <style>{`
        @keyframes fy-bob{from{transform:translateX(-50%) rotateX(58deg) rotateZ(45deg) translateZ(0)}to{transform:translateX(-50%) rotateX(58deg) rotateZ(45deg) translateZ(16px)}}
        @keyframes fy-rise{to{stroke-dashoffset:-22}}
        .fy-layer{position:absolute;left:42%;width:200px;height:200px;transform:translateX(-50%) rotateX(58deg) rotateZ(45deg)}
        .fy-float{animation:fy-bob 5s ease-in-out infinite alternate}
        .fy-label{position:absolute;right:0;text-align:right;font-family:var(--font-mono);font-size:.6rem;letter-spacing:.12em;color:#7fd9f8;white-space:nowrap}
        .fy-label small{display:block;color:#91b8cb;font-size:.58rem;letter-spacing:.04em;margin-top:.2rem}
        .fy-label i{display:inline-block;width:26px;height:1px;background:#6bcaf0;vertical-align:middle;margin-left:.5rem;opacity:.6}
        @media(prefers-reduced-motion:reduce){.fy-float{animation:none}.fy-rise{animation:none}}
        `}</style>
        <svg style={{ position: "absolute", left: "42%", top: 0, height: "100%", width: 2, overflow: "visible" }} viewBox="0 0 2 440" preserveAspectRatio="none"><path d="M 1 30 V 330" className="fy-rise" style={{ fill: "none", stroke: "#8ee3ff", strokeWidth: 1.4, strokeDasharray: "3 8", filter: "drop-shadow(0 0 2px #78dfff)", animation: "fy-rise 1.8s linear infinite" }}></path></svg>
        <div className="fy-layer fy-float" style={{ top: 28, background: "rgba(174,233,255,.06)", border: "1px solid #8fdffb4d", animationDelay: "-1s" }}></div>
        <div className="fy-layer fy-float" style={{ top: 104, background: "rgba(174,233,255,.09)", border: "1px solid #8fdffb66", animationDelay: "-2.6s" }}></div>
        <div className="fy-layer fy-float" style={{ top: 180, background: "#091c2d99", border: "1px dashed #78d6f4", animationDelay: "-4.2s" }}></div>
        <div className="fy-layer" style={{ top: 292, background: "#052033", border: "1px solid #1c4a66" }}></div>
        <div className="fy-layer" style={{ top: 280, background: "linear-gradient(145deg,#1d91c8,#0a3454)", border: "1px solid #b1edff9e", boxShadow: "0 0 50px #3cbdf444" }}></div>
        <div className="fy-label" style={{ top: 66 }}>USER SPACE<i></i><small>brew · flatpak · nix</small></div>
        <div className="fy-label" style={{ top: 142 }}>CONTAINERS<i></i><small>podman · distrobox · incus</small></div>
        <div className="fy-label" style={{ top: 218 }}>SYSEXT LAYER<i></i><small>versioned · removable</small></div>
        <div className="fy-label" style={{ top: 324, color: "var(--ice)" }}>BASE IMAGE<i></i><small>known-good · stays put</small></div>
      </div>
    </section>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
      {fyPrinciples.map(([n, t, b], i) => <article key={n} style={{ padding: i ? "2.25rem 2rem 2.4rem" : "2.25rem 2rem 2.4rem 0", borderLeft: i ? "1px solid var(--line)" : "none" }}>
        <span style={{ color: "var(--sky)", fontFamily: "var(--font-mono)", fontSize: ".72rem" }}>{n}</span>
        <h2 style={{ fontSize: "1.08rem", margin: ".75rem 0" }}>{t}</h2>
        <p style={{ color: "var(--text-dim)", fontSize: ".91rem", margin: 0 }}>{b}</p>
      </article>)}
    </section>

    <section id="images" style={{ padding: "8rem 0" }}>
      <SectionHeading eyebrow="Three base images" title={<span>Choose the terrain.<br />The foundation is shared.</span>} lede="Each image starts from the same reproducible Debian base and takes a clear role from there." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", marginTop: "3.3rem" }}>
        {fyImages.map((im, i) => <ImageCard key={im.name} {...im} index={i} href={"#" + im.name} />)}
      </div>
    </section>

    <section id="extensions" style={{ padding: "8rem 0", borderTop: "1px solid var(--line)", display: "grid", gridTemplateColumns: ".85fr 1.15fr", gap: "4rem" }}>
      <SectionHeading eyebrow="System extensions" title={<span>More capability.<br />No base-image sprawl.</span>} lede="Sysexts are versioned, removable overlays for the parts of your system that deserve their own lifecycle." compact />
      <div style={{ display: "grid", gridTemplateColumns: ".7fr 1.3fr", gap: "2rem", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: "7rem", letterSpacing: "-.09em", lineHeight: .8, color: "var(--ice)", fontWeight: 700 }}>19</strong>
          <p style={{ color: "#a7c2d0", fontSize: ".82rem", margin: "1rem 0" }}>published extensions<br />in the live catalog</p>
          <a href="https://repository.frostyard.org/ext/index" style={{ color: "#8eddf9", fontSize: ".72rem", textDecoration: "none" }}>View repository index ↗</a>
          <div style={{ height: 1, background: "var(--gradient-ice-line)", width: "100%", marginTop: "1.1rem" }}></div>
        </div>
        <div>
          {fyGroups.map(([g, items], gi) => <article key={g} style={{ padding: "1.1rem 0", borderBottom: "1px solid var(--line)", borderTop: gi === 0 ? "1px solid var(--line)" : "none" }}>
            <p style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".14em", color: "#7cbddc", margin: ".1rem 0 .75rem" }}>{g}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem" }}>{items.map(([label, v]) => <Tag key={label} version={v}>{label}</Tag>)}</div>
          </article>)}
        </div>
      </div>
    </section>

    <section style={{ paddingTop: "1rem" }}>
      <div style={{ background: "var(--panel-bright)", border: "1px solid var(--line-strong)", padding: "3.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4rem", position: "relative", overflow: "hidden" }}>
        <div>
          <Eyebrow>The practical model</Eyebrow>
          <h2 style={{ fontSize: "clamp(2.3rem,3.8vw,3.8rem)", lineHeight: 1, letterSpacing: "-.06em", margin: ".2rem 0 1.3rem", fontWeight: 700 }}>Install software<br />at the right altitude.</h2>
          <p style={{ color: "#b7d3df", maxWidth: 370 }}>Immutability is not a prohibition. It is a boundary that makes each choice easier to reverse and reason about.</p>
        </div>
        <div>
          {fyLanes.map(([n, t, b]) => <article key={n} style={{ display: "flex", gap: "1rem", padding: "1.15rem 0", borderTop: "1px solid #92d8f43d", position: "relative", zIndex: 1 }}>
            <b style={{ fontFamily: "var(--font-mono)", fontSize: ".7rem", color: "#62c7ef", fontWeight: 400 }}>{n}</b>
            <div><h3 style={{ fontSize: "1rem", margin: 0 }}>{t}</h3><p style={{ fontSize: ".82rem", color: "#a9c7d5", margin: ".3rem 0 0" }}>{b}</p></div>
          </article>)}
        </div>
        <div style={{ content: '""', position: "absolute", width: 400, height: 400, border: "1px solid #5dc2e333", borderRadius: "50%", right: -260, bottom: -280 }}></div>
      </div>
    </section>

    <section style={{ margin: "8rem 0", display: "grid", gridTemplateColumns: "1fr .8fr auto", gap: "3rem", alignItems: "end", borderBottom: "1px solid var(--line)", paddingBottom: "3rem" }}>
      <div>
        <Eyebrow>No magic, just composition</Eyebrow>
        <h2 style={{ fontSize: "clamp(2.5rem,4vw,4.25rem)", letterSpacing: "-.06em", lineHeight: 1, margin: ".25rem 0 0", fontWeight: 700 }}>Built in the open<br />with <code style={{ color: "#8ee3ff", fontSize: ".8em", fontFamily: "var(--font-mono)" }}>mkosi</code>.</h2>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: ".91rem", margin: 0 }}>Cayo, Snow, and Snowfield share one definition, then branch only where purpose demands: packages, kernel, and configuration.</p>
      <Button variant="primary" href="https://github.com/frostyard/snosi" glyph="↗">Inspect snosi</Button>
    </section>
  </div>;
}
window.FyHome = FyHome;