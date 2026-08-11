// Pilothouse screens — data mirrors the real module inventory (sysext, services, podman, docker, incus, system)
const phSysexts = [
  ["podman", "Podman + Distrobox", "5.4.2+ds1-2+b2", "merged", null],
  ["docker", "Docker CE", "5+29.4.1-1~debian.13~trixie", "merged", "update"],
  ["tailscale", "Tailscale", "1.98.3", "merged", null],
  ["vscode", "Visual Studio Code", "1.127.0-1782814776", "installed", "update"],
  ["incus", "Incus", "1+7.2-debian13-202607011341+r1", "merged", null],
  ["dev", "Development tools", "12.12", "installed", null],
];
const phServices = [
  ["pilothouse.service", "Web console", "active", "enabled"],
  ["pilothoused.service", "Action broker", "active", "enabled"],
  ["podman.socket", "Podman API socket", "active", "enabled"],
  ["systemd-sysupdate.timer", "Update timer", "active", "enabled"],
  ["docker.service", "Docker engine", "failed", "enabled"],
  ["tailscaled.service", "Tailscale daemon", "active", "enabled"],
];
const phContainers = [
  ["registry", "docker.io/library/registry:3", "running", "2 weeks"],
  ["forgejo", "codeberg.org/forgejo/forgejo:13", "running", "2 weeks"],
  ["runner-1", "code.forgejo.org/forgejo/runner:11", "running", "4 days"],
  ["backup", "docker.io/offen/docker-volume-backup:v2", "exited", "6 hours"],
];
window.phFleet = [
  { id: "workstation-01", image: "snow", role: "Desktop", os: "snow 2026.07", kernel: "6.15.4-bpo", uptime: "11 days", cpu: 23, cores: "8 cores", load: "0.84", mem: 41, memUsed: "13.1 GB used", memTot: "32 GB", disk: 62, diskUsed: "290 GB used", diskTot: "468 GB", updates: 2, attention: 3, state: "ok", heroA: "The system below is ", heroEm: "calm.", heroP: "Snow 2026.07 on the current deployment. Previous deployment retained. 2 extension updates are staged and waiting." },
  { id: "surface-go", image: "snowfield", role: "Surface", os: "snowfield 2026.07", kernel: "6.15.4-surface", uptime: "3 days", cpu: 12, cores: "4 cores", load: "0.31", mem: 55, memUsed: "8.7 GB used", memTot: "16 GB", disk: 38, diskUsed: "97 GB used", diskTot: "256 GB", updates: 0, attention: 0, state: "ok", heroA: "Tuned for the hardware. ", heroEm: "Still boring.", heroP: "Snowfield with the linux-surface kernel. No staged updates; nothing needs attention." },
  { id: "cayo-01", image: "cayo", role: "Server", os: "cayo 2026.07", kernel: "6.12.30", uptime: "84 days", cpu: 8, cores: "16 cores", load: "0.42", mem: 33, memUsed: "21 GB used", memTot: "64 GB", disk: 71, diskUsed: "1.4 TB used", diskTot: "2 TB", updates: 1, attention: 1, state: "warn", heroA: "A quiet base, ", heroEm: "doing its job.", heroP: "Headless Cayo running the container workloads. Storage is above 70% and one extension update is staged." },
  { id: "cayo-02", image: "cayo", role: "Server", os: "cayo 2026.06", kernel: "6.12.27", uptime: "126 days", cpu: 4, cores: "8 cores", load: "0.11", mem: 19, memUsed: "5.8 GB used", memTot: "32 GB", disk: 44, diskUsed: "410 GB used", diskTot: "1 TB", updates: 1, attention: 1, state: "danger", heroA: "One deployment ", heroEm: "behind.", heroP: "Running last month's image with docker.service failed. Update is staged; reboot when the workload allows." },
];
const phAttention = [
  ["docker.service failed", "unit entered failed state · 12 min ago", "danger", "Failed unit"],
  ["Storage above 60%", "/var at 62% of 468 GB", "warn", "Disk"],
  ["2 sysext updates", "docker, vscode have newer versions", "warn", "Updates"],
];

function PhBadge({ tone, children }) { return <span className={"ph-badge " + (tone || "")}>{children}</span>; }
function PhCardHeading({ title, sub, link }) {
  return <div className="ph-card-heading split"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{link && <a href="#" className="ph-card-link" onClick={e => e.preventDefault()}>{link} →</a>}</div>;
}
function PhMetric({ label, value, unit, pct, tone, foot }) {
  return <div className="ph-card ph-metric">
    <PhCardHeading title={label} />
    <div className="ph-metric-row"><strong>{value}</strong><span>{unit}</span></div>
    <div className={"ph-meter " + (tone || "")}><span style={{ width: pct + "%" }}></span></div>
    <div className="ph-metric-foot"><span>{foot[0]}</span><span>{foot[1]}</span></div>
  </div>;
}

function PhOverview({ go, sys }) {
  const heroImgs = { snow: "moonlit-summit", snowfield: "alpine-morning", cayo: "frozen-reflection" };
  return <div className="ph-grid">
    <div className="ph-card ph-hero ph-span-full">
      <div className="ph-hero-art"><img src={"../../assets/hero/" + (heroImgs[sys.image] || "moonlit-summit") + ".png"} alt="" /></div>
      <div className="ph-hero-kicker"><span></span>{sys.image} · {sys.id}</div>
      <h2>{sys.heroA}<em>{sys.heroEm}</em></h2>
      <p>{sys.heroP}</p>
      <table className="ph-facts"><tbody>
        <tr><th>OS</th><th>Kernel</th><th>Uptime</th></tr>
        <tr><td>{sys.os}</td><td>{sys.kernel}</td><td>{sys.uptime}</td></tr>
      </tbody></table>
    </div>
    <div className="ph-span-third"><PhMetric label="CPU" value={sys.cpu} unit="%" pct={sys.cpu} foot={[sys.cores, "load " + sys.load]} /></div>
    <div className="ph-span-third"><PhMetric label="Memory" value={sys.mem} unit="%" pct={sys.mem} foot={[sys.memUsed, sys.memTot]} /></div>
    <div className="ph-span-third"><PhMetric label="Storage /var" value={sys.disk} unit="%" tone={sys.disk > 60 ? "warn" : ""} pct={sys.disk} foot={[sys.diskUsed, sys.diskTot]} /></div>
    <div className="ph-card ph-span-half">
      <PhCardHeading title="Needs attention" sub="disk · memory · load · failed units" link="View all" />
      <div className="ph-mini">
        {phAttention.map(([t, s, tone, badge]) => <div className="ph-mini-row" key={t}>
          <div><strong>{t}</strong><small>{s}</small></div><PhBadge tone={tone}>{badge}</PhBadge>
        </div>)}
      </div>
    </div>
    <div className="ph-card ph-span-half">
      <PhCardHeading title="Services" sub="units with lifecycle controls" link="Manage" />
      <div className="ph-mini">
        {phServices.slice(0, 3).map(([name, desc, state]) => <div className="ph-mini-row" key={name}>
          <div><strong>{name}</strong><small>{desc}</small></div><PhBadge tone={state === "active" ? "ok" : "danger"}>{state}</PhBadge>
        </div>)}
      </div>
    </div>
    <div className="ph-card ph-table-card ph-span-full">
      <div className="ph-table-toolbar"><h2>System extensions</h2><span>6 installed · 2 updates</span></div>
      <table className="ph-table"><thead><tr><th>Extension</th><th>Version</th><th>State</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead><tbody>
        {phSysexts.slice(0, 4).map(([id, label, v, state, upd]) => <tr key={id}>
          <td><div className="ph-name"><strong>{label}</strong><small>{id}</small></div></td>
          <td><span className="ph-version">{v}</span></td>
          <td><PhBadge tone="ok">{state}</PhBadge>{upd && <span style={{ marginLeft: 6 }}><PhBadge tone="warn">update</PhBadge></span>}</td>
          <td><div className="ph-actions">{upd && <button className="ph-button">Update</button>}<button className="ph-button secondary">Details</button></div></td>
        </tr>)}
      </tbody></table>
    </div>
  </div>;
}

function PhSysexts() {
  return <div style={{ display: "grid", gap: 14 }}>
    <div className="ph-card ph-table-card">
      <div className="ph-table-toolbar"><h2>System extensions</h2><div style={{ display: "flex", gap: 8 }}><button className="ph-button secondary">Refresh merge</button><button className="ph-button">Update all</button></div></div>
      <table className="ph-table"><thead><tr><th>Extension</th><th>Version</th><th>State</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead><tbody>
        {phSysexts.map(([id, label, v, state, upd]) => <tr key={id}>
          <td><div className="ph-name"><strong>{label}</strong><small>{id} · /usr/lib/sysupdate.{id}.d</small></div></td>
          <td><span className="ph-version">{v}</span></td>
          <td><PhBadge tone={state === "merged" ? "ok" : ""}>{state}</PhBadge>{upd && <span style={{ marginLeft: 6 }}><PhBadge tone="warn">update</PhBadge></span>}</td>
          <td><div className="ph-actions">{upd && <button className="ph-button">Update</button>}<button className="ph-button danger">Remove</button></div></td>
        </tr>)}
      </tbody></table>
    </div>
  </div>;
}

function PhServices() {
  return <div className="ph-card ph-table-card">
    <div className="ph-table-toolbar"><h2>Services, sockets & timers</h2><span>{phServices.length} units</span></div>
    <table className="ph-table"><thead><tr><th>Unit</th><th>State</th><th>Enablement</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead><tbody>
      {phServices.map(([name, desc, state, enab]) => <tr key={name}>
        <td><div className="ph-name"><strong>{name}</strong><small>{desc}</small></div></td>
        <td><PhBadge tone={state === "active" ? "ok" : "danger"}>{state}</PhBadge></td>
        <td><PhBadge>{enab}</PhBadge></td>
        <td><div className="ph-actions"><button className="ph-button secondary">{state === "failed" ? "Restart" : "Stop"}</button><button className="ph-button secondary">Logs</button></div></td>
      </tr>)}
    </tbody></table>
  </div>;
}

function PhPodman() {
  return <div style={{ display: "grid", gap: 0 }}>
    <div className="ph-stats">
      <div className="ph-stat"><span>Engine</span><strong className="ph-version">podman 5.4.2</strong><small>system store</small></div>
      <div className="ph-stat"><span>Containers</span><strong>4</strong><small>3 running</small></div>
      <div className="ph-stat"><span>Images</span><strong>11</strong><small>4.2 GB reported</small></div>
      <div className="ph-stat"><span>Pods</span><strong>1</strong><small>infra shared</small></div>
    </div>
    <div className="ph-card ph-table-card">
      <div className="ph-table-toolbar"><h2>Containers</h2><span>system podman · bounded logs</span></div>
      <table className="ph-table"><thead><tr><th>Container</th><th>Image</th><th>State</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead><tbody>
        {phContainers.map(([name, image, state, age]) => <tr key={name}>
          <td><div className="ph-name"><strong>{name}</strong><small>up {age}</small></div></td>
          <td><span className="ph-version">{image}</span></td>
          <td><PhBadge tone={state === "running" ? "ok" : ""}>{state}</PhBadge></td>
          <td><div className="ph-actions"><button className="ph-button secondary">{state === "running" ? "Stop" : "Start"}</button><button className="ph-button secondary">Logs</button></div></td>
        </tr>)}
      </tbody></table>
    </div>
  </div>;
}

function PhFleet({ current, onPick }) {
  const stateBadge = { ok: ["ok", "healthy"], warn: ["warn", "attention"], danger: ["danger", "degraded"] };
  return <div className="ph-card ph-table-card">
    <div className="ph-table-toolbar"><h2>Fleet</h2><span>{window.phFleet.length} systems · same base, deliberate layers</span></div>
    <table className="ph-table"><thead><tr><th>System</th><th>Image</th><th>Deployment</th><th>State</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead><tbody>
      {window.phFleet.map(sys => { const [tone, label] = stateBadge[sys.state]; return <tr key={sys.id} style={sys.id === current ? { background: "rgba(71,184,239,.05)" } : null}>
        <td><div className="ph-name"><strong>{sys.id}{sys.id === current ? " ·" : ""} {sys.id === current && <span style={{ color: "var(--sky)", fontWeight: 400, fontSize: 10 }}>connected</span>}</strong><small>{sys.role.toLowerCase()} · up {sys.uptime}</small></div></td>
        <td><span className="ph-version">{sys.os}</span></td>
        <td><span className="ph-version">{sys.kernel}</span>{sys.updates > 0 && <span style={{ marginLeft: 6 }}><PhBadge tone="warn">{sys.updates} update{sys.updates > 1 ? "s" : ""}</PhBadge></span>}</td>
        <td><PhBadge tone={tone}>{label}</PhBadge></td>
        <td><div className="ph-actions"><button className="ph-button" onClick={() => onPick(sys.id)}>Open</button></div></td>
      </tr>; })}
    </tbody></table>
  </div>;
}

function PhLogin({ onLogin }) {
  return <div className="ph-login-body">
    <div className="ph-login">
      <div className="ph-login-panel">
        <a className="ph-brand" href="#" style={{ padding: 0 }}><span className="flake">❄</span><span><strong>Pilothouse</strong><small>frostyard admin</small></span></a>
        <div className="ph-login-copy">
          <h1>Sign in to the <em>quiet cockpit.</em></h1>
          <p>Pilothouse uses this machine's own accounts and policy. Any account can view the dashboard; administrators can act on extensions, services, and containers.</p>
          <form className="ph-login-form" onSubmit={e => { e.preventDefault(); onLogin(); }}>
            <label>Username<input defaultValue="bjk" autoComplete="username" /></label>
            <label>Password<input type="password" defaultValue="••••••••••" autoComplete="current-password" /></label>
            <button className="ph-button" type="submit" style={{ justifyContent: "center", minHeight: 43, width: "100%" }}>Sign in</button>
          </form>
        </div>
        <p className="ph-login-foot">Loopback-only by default. Cold systems. Clear boundaries.</p>
      </div>
      <div className="ph-login-art">
        <img src="../../assets/hero/frozen-reflection.png" alt="" />
        <div><span>snow · workstation-01</span><strong>Keep the base still. Move with intent.</strong></div>
      </div>
    </div>
  </div>;
}

Object.assign(window, { PhOverview, PhSysexts, PhServices, PhPodman, PhLogin, PhFleet });