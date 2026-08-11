/* @ds-bundle: {"format":4,"namespace":"FrostyardDesignSystem_375ef6","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Eyebrow","sourcePath":"components/core/Eyebrow.jsx"},{"name":"SectionHeading","sourcePath":"components/core/SectionHeading.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"ImageCard","sourcePath":"components/site/ImageCard.jsx"},{"name":"NavBar","sourcePath":"components/site/NavBar.jsx"},{"name":"SiteFooter","sourcePath":"components/site/SiteFooter.jsx"}],"sourceHashes":{"components/core/Button.jsx":"5f19189eb6ed","components/core/Eyebrow.jsx":"d37db48af068","components/core/SectionHeading.jsx":"9bf6b9d2d528","components/core/Tag.jsx":"01790f7d948a","components/site/ImageCard.jsx":"546e924b804a","components/site/NavBar.jsx":"7e148364a396","components/site/SiteFooter.jsx":"4d60522c7ae0","ui_kits/docs/docsData.jsx":"11f347d5484d","ui_kits/frostyard-org/Home.jsx":"fe31d7eb5635","ui_kits/frostyard-org/Tools.jsx":"6103bc8177d4","ui_kits/frostyard-org/WhyAtomic.jsx":"a05d2ae1c72b","ui_kits/pilothouse/Screens.jsx":"b4f0da7bf623"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FrostyardDesignSystem_375ef6 = window.FrostyardDesignSystem_375ef6 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function Button({
  variant = "primary",
  href = "#",
  children,
  glyph,
  onClick,
  style
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: ".75rem 1rem",
    borderRadius: "var(--radius-button)",
    fontSize: ".86rem",
    fontWeight: 650,
    textDecoration: "none",
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    whiteSpace: "nowrap"
  };
  const variants = {
    primary: {
      background: "var(--gradient-primary)",
      color: "var(--on-primary)"
    },
    ghost: {
      border: "1px solid var(--line)",
      color: "#d8edf7",
      background: "transparent"
    }
  };
  return /*#__PURE__*/React.createElement("a", {
    href: href,
    onClick: onClick,
    style: {
      ...base,
      ...variants[variant],
      ...style
    }
  }, children, glyph && /*#__PURE__*/React.createElement("span", {
    style: {
      color: variant === "primary" ? "var(--on-primary)" : "var(--ice)",
      marginLeft: ".35rem"
    }
  }, glyph));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Eyebrow.jsx
try { (() => {
function Eyebrow({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "var(--text-eyebrow-size)",
      textTransform: "uppercase",
      letterSpacing: "var(--text-eyebrow-ls)",
      fontWeight: 700,
      color: "var(--text-eyebrow)",
      margin: "0 0 1.1rem",
      fontFamily: "var(--font-sans)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: "var(--eyebrow-dash-w)",
      height: 1,
      background: "var(--sky)",
      display: "inline-block",
      verticalAlign: "middle",
      marginRight: ".6rem"
    }
  }), children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/core/SectionHeading.jsx
try { (() => {
function SectionHeading({
  eyebrow,
  title,
  lede,
  compact,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 670,
      ...style
    }
  }, eyebrow && /*#__PURE__*/React.createElement(__ds_scope.Eyebrow, null, eyebrow), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: compact ? "clamp(2.3rem,3.8vw,3.8rem)" : "var(--text-h2-size)",
      letterSpacing: "var(--text-h2-ls)",
      lineHeight: 1,
      margin: ".25rem 0 1.25rem",
      color: "var(--text-body)",
      fontFamily: "var(--font-sans)",
      fontWeight: 700
    }
  }, title), lede && /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--text-dim)",
      fontSize: ".91rem",
      margin: 0
    }
  }, lede));
}
Object.assign(__ds_scope, { SectionHeading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SectionHeading.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function Tag({
  children,
  version,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-tag-size)",
      border: "1px solid var(--line-tag)",
      color: "var(--tag-text)",
      padding: ".28rem .45rem",
      borderRadius: "var(--radius-tag)",
      fontFamily: "var(--font-sans)",
      display: "inline-block",
      lineHeight: 1.4,
      ...style
    }
  }, children, version && /*#__PURE__*/React.createElement("small", {
    style: {
      color: "#72bad8",
      display: "block",
      fontSize: ".57rem",
      lineHeight: 1.3,
      marginTop: ".15rem",
      maxWidth: 160,
      overflowWrap: "anywhere"
    }
  }, "v", version));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/site/ImageCard.jsx
try { (() => {
const heroScenes = ["moonlit-summit", "alpine-morning", "frozen-reflection", "blueprint"];
function ImageCard({
  type,
  index = 0,
  name,
  title,
  body,
  tags = [],
  href = "#",
  artSrc,
  assetsBase = "../../assets"
}) {
  const grads = ["var(--gradient-card)", "var(--gradient-card-alt)", "var(--gradient-card-deep)"];
  const src = artSrc || assetsBase + "/hero/" + heroScenes[index % heroScenes.length] + ".png";
  return /*#__PURE__*/React.createElement("article", {
    style: {
      minHeight: 425,
      border: "1px solid var(--line)",
      background: grads[index % 3],
      padding: "var(--card-pad)",
      position: "relative",
      overflow: "hidden",
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontFamily: "var(--font-mono)",
      fontSize: ".68rem",
      textTransform: "uppercase",
      letterSpacing: ".09em",
      color: "#9bcbdf"
    }
  }, /*#__PURE__*/React.createElement("span", null, type), /*#__PURE__*/React.createElement("b", {
    style: {
      fontWeight: 400,
      color: "#6b93a8"
    }
  }, "0", index + 1)), /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      height: 125,
      position: "relative",
      margin: "1rem -1.35rem 1.3rem",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "",
    style: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "220%",
      objectFit: "cover",
      objectPosition: "50% 58%",
      display: "block"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      background: "linear-gradient(180deg,rgba(6,17,29,.25),transparent 40%,rgba(9,28,45,.55))"
    }
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "2rem",
      letterSpacing: "-.06em",
      margin: 0
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: href,
    style: {
      color: "var(--text-body)",
      textDecoration: "none"
    }
  }, name)), /*#__PURE__*/React.createElement("h4", {
    style: {
      fontSize: "1rem",
      margin: ".5rem 0",
      color: "#e7f8ff",
      fontWeight: 600
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: ".87rem",
      color: "#b5cedb",
      margin: 0
    }
  }, body), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: ".35rem",
      flexWrap: "wrap",
      marginTop: "1.4rem"
    }
  }, tags.map(t => /*#__PURE__*/React.createElement(__ds_scope.Tag, {
    key: t
  }, t))));
}
Object.assign(__ds_scope, { ImageCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/site/ImageCard.jsx", error: String((e && e.message) || e) }); }

// components/site/NavBar.jsx
try { (() => {
function NavBar({
  links = [["Base", "/base"], ["Images", "#images"], ["Extensions", "#extensions"], ["Why Atomic", "/why-atomic"], ["Tools", "/tools"]],
  current,
  sourceLabel = "Source",
  sourceHref = "https://github.com/frostyard/snosi",
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      height: "var(--nav-height)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: "1px solid var(--line)",
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#top",
    onClick: onNavigate && (e => {
      e.preventDefault();
      onNavigate("home");
    }),
    style: {
      fontWeight: 720,
      letterSpacing: "-.04em",
      fontSize: "1.25rem",
      color: "var(--text-body)",
      textDecoration: "none",
      whiteSpace: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ice)",
      fontSize: "1.55rem",
      marginRight: ".3rem"
    }
  }, "\u2744"), " frostyard"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "2rem",
      fontSize: ".87rem",
      color: "#b7d0df"
    }
  }, links.map(([label, href]) => /*#__PURE__*/React.createElement("a", {
    key: label,
    href: href,
    onClick: onNavigate && (e => {
      e.preventDefault();
      onNavigate(href);
    }),
    style: {
      color: current === label ? "var(--ice)" : "inherit",
      textDecoration: "none"
    },
    onMouseEnter: e => e.target.style.color = "var(--ice)",
    onMouseLeave: e => e.target.style.color = current === label ? "var(--ice)" : "#b7d0df"
  }, label))), /*#__PURE__*/React.createElement("a", {
    href: sourceHref,
    style: {
      fontSize: ".83rem",
      border: "1px solid var(--line)",
      padding: ".55rem .8rem",
      borderRadius: "var(--radius-pill)",
      color: "#d9f2ff",
      textDecoration: "none"
    }
  }, sourceLabel, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ice)",
      marginLeft: ".35rem"
    }
  }, "\u2197")));
}
Object.assign(__ds_scope, { NavBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/site/NavBar.jsx", error: String((e && e.message) || e) }); }

// components/site/SiteFooter.jsx
try { (() => {
function SiteFooter({
  tagline = "Cold systems. Clear boundaries.",
  linkLabel = "github.com/frostyard/snosi ↗",
  linkHref = "https://github.com/frostyard/snosi"
}) {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      color: "var(--text-footer)",
      fontSize: ".8rem",
      paddingBottom: "3rem",
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#top",
    style: {
      fontWeight: 720,
      letterSpacing: "-.04em",
      fontSize: "1.25rem",
      color: "var(--text-body)",
      textDecoration: "none",
      whiteSpace: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--ice)",
      fontSize: "1.55rem",
      marginRight: ".3rem"
    }
  }, "\u2744"), " frostyard"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0
    }
  }, tagline), /*#__PURE__*/React.createElement("a", {
    href: linkHref,
    style: {
      color: "#a4d9ef",
      textDecoration: "none"
    }
  }, linkLabel));
}
Object.assign(__ds_scope, { SiteFooter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/site/SiteFooter.jsx", error: String((e && e.message) || e) }); }

// ui_kits/docs/docsData.jsx
try { (() => {
window.fyDocsProjects = {
  snosi: {
    label: "snosi",
    kicker: "Image build system",
    nav: [["Getting started", ["Overview", "Installation", "Quickstart"]], ["Concepts", ["Why atomic", "Images", "Extensions"]], ["Reference", ["mkosi profiles", "CI pipeline"]]],
    page: {
      title: "Why atomic",
      toc: ["Your OS as an image", "Atomic updates and rollbacks", "No configuration drift"],
      sections: [["Your OS as an image", "Snosi applies the container model to the entire operating system. Images are defined with mkosi, built in CI, published to a repository, and deployed to bare metal, VMs, or the cloud. There is no divide between how you build application containers and how you build the host they run on.", {
        code: "mkosi --profile snow build"
      }], ["Atomic updates and rollbacks", "Updates are transactional. A new OS image downloads in the background while the current system runs uninterrupted. On reboot, the system switches to the new deployment atomically — the update either applies completely, or not at all. The previous working image is always preserved.", {
        callout: ["Rollback", "If an update causes problems, select the prior deployment from the boot menu. The two-image model means even catastrophic update failures cannot brick a system."]
      }], ["No configuration drift", "The root filesystem is read-only. Only /etc and /var are writable. Every machine running the same image is provably identical in its system files; changes are committed to the image definition, not applied as undocumented one-off fixes.", {}]]
    }
  },
  updex: {
    label: "updex",
    kicker: "System extension manager",
    nav: [["Getting started", ["Overview", "Installation"]], ["Usage", ["Discovering features", "Enabling extensions", "Updates and retention"]], ["Reference", ["CLI", "JSON output", "Go SDK"]]],
    page: {
      title: "Enabling extensions",
      toc: ["Discover features", "Enable with merge", "Verify state"],
      sections: [["Discover features", "Updex reads ordinary transfer definitions from /usr/lib/sysupdate.d and component-scoped directories, then lists every published feature with its current and available versions.", {
        code: "updex features"
      }], ["Enable with merge", "Enabling downloads the versioned artifact, verifies its SHA256 manifest (and GPG signature when published), and asks systemd-sysext to merge the overlay immediately with --now.", {
        code: "updex enable podman --now"
      }], ["Verify state", "Installed and merged state comes straight from systemd-sysext. Version retention is bounded, so retired versions are cleaned up automatically.", {
        callout: ["Boundary", "Updex never modifies the base image. Extensions are versioned, removable overlays — disable one and the base is exactly as it was."]
      }]]
    }
  },
  chairlift: {
    label: "ChairLift",
    kicker: "Desktop system workspace",
    nav: [["Getting started", ["Overview", "Installation"]], ["Workspace", ["System updates", "Homebrew", "Flatpak", "Extension features"]], ["Reference", ["Maintenance shortcuts"]]],
    page: {
      title: "System updates",
      toc: ["Staging a deployment", "Inspecting changes", "Rebooting into it"],
      sections: [["Staging a deployment", "ChairLift stages operating system updates in the background. The current system keeps running; the new deployment waits until you choose to reboot into it.", {}], ["Inspecting changes", "Before rebooting, review exactly what the new image changes: package versions, kernel, and configuration. No surprises at boot.", {
        callout: ["Quiet by design", "ChairLift surfaces state and stages work. It does not nag, auto-reboot, or hide what the system below is doing."]
      }], ["Rebooting into it", "Reboot when it suits the work. The previous deployment stays available as a clear path back.", {
        code: "chairlift"
      }]]
    }
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/docs/docsData.jsx", error: String((e && e.message) || e) }); }

// ui_kits/frostyard-org/Home.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  Eyebrow,
  Tag,
  SectionHeading,
  ImageCard
} = window.FrostyardDesignSystem_375ef6;
const fyImages = [{
  type: "Desktop",
  name: "snow",
  title: "A GNOME workstation that stays composed.",
  body: "A daily desktop built on Debian Trixie with a current backports kernel, atomic OS updates, and room for real work.",
  tags: ["GNOME", "Backports kernel", "Atomic updates"]
}, {
  type: "Surface",
  name: "snowfield",
  title: "Snow, tuned for Surface hardware.",
  body: "The Snow desktop with linux-surface and the hardware support that makes a tablet or laptop feel like a first-class machine.",
  tags: ["GNOME", "linux-surface", "Touch-ready"]
}, {
  type: "Server",
  name: "cayo",
  title: "A quiet base for services and containers.",
  body: "A headless image for servers, labs, and small infrastructure. Podman is ready; the host stays deliberately uninteresting.",
  tags: ["Headless", "Containers", "Virtualization"]
}];
const fyGroups = [["Workstation", [["1Password desktop", "8.12.26"], ["Bitwarden", "2026.6.1"], ["Claude Desktop", "1.18286.2"], ["Microsoft Edge", "150.0.4078.48-1"], ["Visual Studio Code", "1.127.0-1782814776"]]], ["Development", [["Development tools", "12.12"], ["Debian development", "1.0.141"], ["Nix", "2.26.3+dfsg-1"], ["Podman + Distrobox", "5.4.2+ds1-2+b2"], ["Docker CE", "5+29.4.1-1~debian.13~trixie"]]], ["Infrastructure", [["Tailscale", "1.98.3"], ["Azure VPN", "3.0.0"], ["Incus", "1+7.2-debian13-202607011341+r1"], ["Coder", "2.34.6-1"], ["code-server", "4.118.0"], ["Lemonade", "10.10.0~13"]]], ["Also published", [["1Password CLI", "2.33.1-1"], ["Emdash", "0.4.50"], ["Himmelblau", "4.0.0-debian13~20260514"]]]];
const fyPrinciples = [["01", "Atomic by default", "Update the whole operating system as a coherent image. Reboot into the new deployment; keep the previous one available."], ["02", "Mutable where it counts", "Your data, configuration, containers, and projects live in persistent writable storage. The operating system does not get in their way."], ["03", "Tools without drift", "Add capabilities as system extensions, containers, or user-space package environments instead of turning the base into a snowball."]];
const fyLanes = [["01", "System extension", "For a tool that belongs close to the OS: VPNs, IDEs, container runtimes, and services."], ["02", "Container or Distrobox", "For development stacks and workloads that should bring their own userspace."], ["03", "User-space environment", "For personal tooling with Nix, Homebrew, Flatpak, or a project-local runtime."]];
function FyHome() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("section", {
    style: {
      minHeight: 560,
      display: "grid",
      gridTemplateColumns: "1.1fr .9fr",
      alignItems: "center",
      position: "relative",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "6rem 0"
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Debian \xB7 mkosi \xB7 bootc or A/B root"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: "clamp(3.4rem,6.4vw,6.4rem)",
      lineHeight: .94,
      letterSpacing: "-.072em",
      margin: 0,
      maxWidth: 720,
      fontWeight: 700
    }
  }, "Keep the system", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--font-serif-accent)",
      fontWeight: 400,
      color: "var(--ice)"
    }
  }, "boring."), " Make the work interesting."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "1.08rem",
      color: "var(--text-muted)",
      maxWidth: 565,
      margin: "2rem 0 2.4rem"
    }
  }, "Frostyard images are atomic, updateable operating systems for desktops and servers. A known-good base stays put; your tools arrive as deliberate layers."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: ".8rem"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    href: "#images",
    glyph: "\u2193"
  }, "Explore images"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    href: "https://github.com/frostyard/snosi",
    glyph: "\u2197"
  }, "Read the build"))), /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      height: 440,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("style", null, `
        @keyframes fy-bob{from{transform:translateX(-50%) rotateX(58deg) rotateZ(45deg) translateZ(0)}to{transform:translateX(-50%) rotateX(58deg) rotateZ(45deg) translateZ(16px)}}
        @keyframes fy-rise{to{stroke-dashoffset:-22}}
        .fy-layer{position:absolute;left:42%;width:200px;height:200px;transform:translateX(-50%) rotateX(58deg) rotateZ(45deg)}
        .fy-float{animation:fy-bob 5s ease-in-out infinite alternate}
        .fy-label{position:absolute;right:0;text-align:right;font-family:var(--font-mono);font-size:.6rem;letter-spacing:.12em;color:#7fd9f8;white-space:nowrap}
        .fy-label small{display:block;color:#91b8cb;font-size:.58rem;letter-spacing:.04em;margin-top:.2rem}
        .fy-label i{display:inline-block;width:26px;height:1px;background:#6bcaf0;vertical-align:middle;margin-left:.5rem;opacity:.6}
        @media(prefers-reduced-motion:reduce){.fy-float{animation:none}.fy-rise{animation:none}}
        `), /*#__PURE__*/React.createElement("svg", {
    style: {
      position: "absolute",
      left: "42%",
      top: 0,
      height: "100%",
      width: 2,
      overflow: "visible"
    },
    viewBox: "0 0 2 440",
    preserveAspectRatio: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 1 30 V 330",
    className: "fy-rise",
    style: {
      fill: "none",
      stroke: "#8ee3ff",
      strokeWidth: 1.4,
      strokeDasharray: "3 8",
      filter: "drop-shadow(0 0 2px #78dfff)",
      animation: "fy-rise 1.8s linear infinite"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "fy-layer fy-float",
    style: {
      top: 28,
      background: "rgba(174,233,255,.06)",
      border: "1px solid #8fdffb4d",
      animationDelay: "-1s"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "fy-layer fy-float",
    style: {
      top: 104,
      background: "rgba(174,233,255,.09)",
      border: "1px solid #8fdffb66",
      animationDelay: "-2.6s"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "fy-layer fy-float",
    style: {
      top: 180,
      background: "#091c2d99",
      border: "1px dashed #78d6f4",
      animationDelay: "-4.2s"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "fy-layer",
    style: {
      top: 292,
      background: "#052033",
      border: "1px solid #1c4a66"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "fy-layer",
    style: {
      top: 280,
      background: "linear-gradient(145deg,#1d91c8,#0a3454)",
      border: "1px solid #b1edff9e",
      boxShadow: "0 0 50px #3cbdf444"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "fy-label",
    style: {
      top: 66
    }
  }, "USER SPACE", /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("small", null, "brew \xB7 flatpak \xB7 nix")), /*#__PURE__*/React.createElement("div", {
    className: "fy-label",
    style: {
      top: 142
    }
  }, "CONTAINERS", /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("small", null, "podman \xB7 distrobox \xB7 incus")), /*#__PURE__*/React.createElement("div", {
    className: "fy-label",
    style: {
      top: 218
    }
  }, "SYSEXT LAYER", /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("small", null, "versioned \xB7 removable")), /*#__PURE__*/React.createElement("div", {
    className: "fy-label",
    style: {
      top: 324,
      color: "var(--ice)"
    }
  }, "BASE IMAGE", /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("small", null, "known-good \xB7 stays put")))), /*#__PURE__*/React.createElement("section", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      borderTop: "1px solid var(--line)",
      borderBottom: "1px solid var(--line)"
    }
  }, fyPrinciples.map(([n, t, b], i) => /*#__PURE__*/React.createElement("article", {
    key: n,
    style: {
      padding: i ? "2.25rem 2rem 2.4rem" : "2.25rem 2rem 2.4rem 0",
      borderLeft: i ? "1px solid var(--line)" : "none"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--sky)",
      fontFamily: "var(--font-mono)",
      fontSize: ".72rem"
    }
  }, n), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "1.08rem",
      margin: ".75rem 0"
    }
  }, t), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--text-dim)",
      fontSize: ".91rem",
      margin: 0
    }
  }, b)))), /*#__PURE__*/React.createElement("section", {
    id: "images",
    style: {
      padding: "8rem 0"
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "Three base images",
    title: /*#__PURE__*/React.createElement("span", null, "Choose the terrain.", /*#__PURE__*/React.createElement("br", null), "The foundation is shared."),
    lede: "Each image starts from the same reproducible Debian base and takes a clear role from there."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: "1rem",
      marginTop: "3.3rem"
    }
  }, fyImages.map((im, i) => /*#__PURE__*/React.createElement(ImageCard, _extends({
    key: im.name
  }, im, {
    index: i,
    href: "#" + im.name
  }))))), /*#__PURE__*/React.createElement("section", {
    id: "extensions",
    style: {
      padding: "8rem 0",
      borderTop: "1px solid var(--line)",
      display: "grid",
      gridTemplateColumns: ".85fr 1.15fr",
      gap: "4rem"
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    eyebrow: "System extensions",
    title: /*#__PURE__*/React.createElement("span", null, "More capability.", /*#__PURE__*/React.createElement("br", null), "No base-image sprawl."),
    lede: "Sysexts are versioned, removable overlays for the parts of your system that deserve their own lifecycle.",
    compact: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: ".7fr 1.3fr",
      gap: "2rem",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      fontSize: "7rem",
      letterSpacing: "-.09em",
      lineHeight: .8,
      color: "var(--ice)",
      fontWeight: 700
    }
  }, "19"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "#a7c2d0",
      fontSize: ".82rem",
      margin: "1rem 0"
    }
  }, "published extensions", /*#__PURE__*/React.createElement("br", null), "in the live catalog"), /*#__PURE__*/React.createElement("a", {
    href: "https://repository.frostyard.org/ext/index",
    style: {
      color: "#8eddf9",
      fontSize: ".72rem",
      textDecoration: "none"
    }
  }, "View repository index \u2197"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: "var(--gradient-ice-line)",
      width: "100%",
      marginTop: "1.1rem"
    }
  })), /*#__PURE__*/React.createElement("div", null, fyGroups.map(([g, items], gi) => /*#__PURE__*/React.createElement("article", {
    key: g,
    style: {
      padding: "1.1rem 0",
      borderBottom: "1px solid var(--line)",
      borderTop: gi === 0 ? "1px solid var(--line)" : "none"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: ".72rem",
      textTransform: "uppercase",
      letterSpacing: ".14em",
      color: "#7cbddc",
      margin: ".1rem 0 .75rem"
    }
  }, g), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: ".35rem"
    }
  }, items.map(([label, v]) => /*#__PURE__*/React.createElement(Tag, {
    key: label,
    version: v
  }, label)))))))), /*#__PURE__*/React.createElement("section", {
    style: {
      paddingTop: "1rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--panel-bright)",
      border: "1px solid var(--line-strong)",
      padding: "3.5rem",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "4rem",
      position: "relative",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, null, "The practical model"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "clamp(2.3rem,3.8vw,3.8rem)",
      lineHeight: 1,
      letterSpacing: "-.06em",
      margin: ".2rem 0 1.3rem",
      fontWeight: 700
    }
  }, "Install software", /*#__PURE__*/React.createElement("br", null), "at the right altitude."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "#b7d3df",
      maxWidth: 370
    }
  }, "Immutability is not a prohibition. It is a boundary that makes each choice easier to reverse and reason about.")), /*#__PURE__*/React.createElement("div", null, fyLanes.map(([n, t, b]) => /*#__PURE__*/React.createElement("article", {
    key: n,
    style: {
      display: "flex",
      gap: "1rem",
      padding: "1.15rem 0",
      borderTop: "1px solid #92d8f43d",
      position: "relative",
      zIndex: 1
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: ".7rem",
      color: "#62c7ef",
      fontWeight: 400
    }
  }, n), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "1rem",
      margin: 0
    }
  }, t), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: ".82rem",
      color: "#a9c7d5",
      margin: ".3rem 0 0"
    }
  }, b))))), /*#__PURE__*/React.createElement("div", {
    style: {
      content: '""',
      position: "absolute",
      width: 400,
      height: 400,
      border: "1px solid #5dc2e333",
      borderRadius: "50%",
      right: -260,
      bottom: -280
    }
  }))), /*#__PURE__*/React.createElement("section", {
    style: {
      margin: "8rem 0",
      display: "grid",
      gridTemplateColumns: "1fr .8fr auto",
      gap: "3rem",
      alignItems: "end",
      borderBottom: "1px solid var(--line)",
      paddingBottom: "3rem"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, null, "No magic, just composition"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "clamp(2.5rem,4vw,4.25rem)",
      letterSpacing: "-.06em",
      lineHeight: 1,
      margin: ".25rem 0 0",
      fontWeight: 700
    }
  }, "Built in the open", /*#__PURE__*/React.createElement("br", null), "with ", /*#__PURE__*/React.createElement("code", {
    style: {
      color: "#8ee3ff",
      fontSize: ".8em",
      fontFamily: "var(--font-mono)"
    }
  }, "mkosi"), ".")), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--text-dim)",
      fontSize: ".91rem",
      margin: 0
    }
  }, "Cayo, Snow, and Snowfield share one definition, then branch only where purpose demands: packages, kernel, and configuration."), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    href: "https://github.com/frostyard/snosi",
    glyph: "\u2197"
  }, "Inspect snosi")));
}
window.FyHome = FyHome;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/frostyard-org/Home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/frostyard-org/Tools.jsx
try { (() => {
const {
  Button: FyBtn,
  Eyebrow: FyEyebrow
} = window.FrostyardDesignSystem_375ef6;
const fyTools = [{
  name: "updex",
  label: "System extension manager",
  mark: "UX",
  title: "Extensions, with a proper control surface.",
  body: "A Go CLI and SDK for discovering, enabling, updating, and retiring systemd-sysext features. It reads ordinary transfer definitions, verifies published artifacts, and keeps version retention bounded.",
  points: ["Feature and component discovery", "SHA256 manifests and optional GPG verification", "Retry-aware downloads and automatic decompression", "CLI, JSON output, and Go SDK"],
  command: "updex features  ·  updex enable podman --now",
  href: "https://github.com/frostyard/updex"
}, {
  name: "ChairLift",
  label: "Desktop system workspace",
  mark: "CL",
  title: "A quiet cockpit for a layered system.",
  body: "A GTK 4 desktop application for keeping a Snow workstation in shape. It puts staged system updates, Homebrew, Flatpak, package health, and extension features in one deliberate place.",
  points: ["Stage and inspect operating system updates", "Manage Homebrew packages and trusted taps", "Work with Flatpak and extension features", "System health and maintenance shortcuts"],
  command: "chairlift",
  href: "https://github.com/frostyard/chairlift"
}];
function FyTools() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("header", {
    style: {
      padding: "7rem 0 5.5rem",
      maxWidth: 820
    }
  }, /*#__PURE__*/React.createElement(FyEyebrow, null, "Tools for the layers"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: "clamp(3.7rem,6vw,6.4rem)",
      lineHeight: .95,
      letterSpacing: "-.075em",
      margin: 0,
      fontWeight: 700
    }
  }, "Keep the base still.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--font-serif-accent)",
      fontWeight: 400,
      color: "var(--ice)"
    }
  }, "Move with intent.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "1.08rem",
      color: "var(--mist)",
      maxWidth: 580,
      margin: "2rem 0 0"
    }
  }, "Frostyard tools make an immutable system practical: manage the extensions around the OS, and give the desktop a clear place to maintain itself.")), /*#__PURE__*/React.createElement("section", {
    style: {
      display: "grid",
      gap: "1rem"
    }
  }, fyTools.map((tool, index) => /*#__PURE__*/React.createElement("article", {
    key: tool.name,
    style: {
      background: index ? "linear-gradient(135deg,#123b55,#0a1b2b)" : "linear-gradient(135deg,#0e3049,#081b2c)",
      border: "1px solid var(--line)",
      padding: "2.2rem 2.4rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      gap: "1rem",
      borderBottom: "1px solid var(--line)",
      paddingBottom: "1.6rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      placeItems: "center",
      width: 48,
      height: 48,
      border: "1px solid #aee9ff80",
      background: "#135477",
      borderRadius: "50%",
      fontWeight: 800,
      fontSize: ".75rem",
      color: "var(--ice)"
    }
  }, tool.mark), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: ".7rem",
      textTransform: "uppercase",
      letterSpacing: ".15em",
      color: "#84bed5",
      margin: 0
    }
  }, tool.label), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "2rem",
      lineHeight: 1,
      letterSpacing: "-.06em",
      margin: ".2rem 0 0"
    }
  }, tool.name)), /*#__PURE__*/React.createElement("a", {
    href: tool.href,
    style: {
      fontSize: "1.4rem",
      color: "var(--ice)",
      textDecoration: "none"
    }
  }, "\u2197")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.2fr .8fr",
      gap: "4rem",
      padding: "2.2rem 0"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "1.45rem",
      letterSpacing: "-.04em",
      margin: "0 0 .7rem"
    }
  }, tool.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: ".93rem",
      color: "var(--mist)",
      margin: "0 0 1.5rem"
    }
  }, tool.body), /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: ".73rem",
      color: "#8ddbf8",
      background: "#061826",
      padding: ".55rem .7rem",
      display: "inline-block"
    }
  }, tool.command)), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      margin: 0,
      padding: 0
    }
  }, tool.points.map(point => /*#__PURE__*/React.createElement("li", {
    key: point,
    style: {
      borderTop: "1px solid var(--line)",
      padding: ".75rem 0",
      color: "#c0dce9",
      fontSize: ".85rem"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "#67cdf3",
      fontSize: ".63rem",
      marginRight: ".6rem"
    }
  }, "\u2726"), point)))), /*#__PURE__*/React.createElement("a", {
    href: tool.href,
    style: {
      fontSize: ".8rem",
      fontWeight: 700,
      color: "#93e0fb",
      textDecoration: "none"
    }
  }, "Inspect ", tool.name, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: ".3rem"
    }
  }, "\u2197"))))), /*#__PURE__*/React.createElement("section", {
    style: {
      margin: "7rem 0 5rem",
      borderTop: "1px solid var(--line)",
      paddingTop: "3rem",
      display: "grid",
      gridTemplateColumns: "1.25fr .75fr",
      gap: "4rem",
      alignItems: "end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: "1/-1"
    }
  }, /*#__PURE__*/React.createElement(FyEyebrow, {
    style: {
      margin: 0
    }
  }, "Different jobs, shared direction")), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "clamp(2rem,3.3vw,3.5rem)",
      lineHeight: 1,
      letterSpacing: "-.06em",
      margin: 0,
      fontWeight: 700
    }
  }, "Updex handles the extension layer.", /*#__PURE__*/React.createElement("br", null), "ChairLift makes that layer approachable."), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--mist)",
      fontSize: ".93rem",
      margin: 0
    }
  }, "Both leave the operating system image intact. That is the point: capabilities can change without turning the base into an accumulation of exceptions.")));
}
window.FyTools = FyTools;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/frostyard-org/Tools.jsx", error: String((e && e.message) || e) }); }

// ui_kits/frostyard-org/WhyAtomic.jsx
try { (() => {
const {
  Eyebrow: WaEyebrow
} = window.FrostyardDesignSystem_375ef6;
const waBreakages = [["The convenient library install", "A project asks for one newer library. A system-wide package or a copied file changes an ABI beneath another tool. The original project works; the next update or unrelated application does not."], ["The one-off repository", "A third-party repository solves an immediate need, then quietly owns dependency decisions for the whole machine. Months later, a routine upgrade becomes a puzzle of pins and held packages."], ["The urgent host fix", "A service needs a runtime, a container engine, or a build stack. Installing it directly makes the host responsible for every library, daemon, and configuration that arrives alongside it."]];
const waPaths = [["Brew", "Personal, local tooling", "Use Homebrew for command-line tools and applications that belong to your own working environment. It keeps that choice in user-space rather than rewriting the image."], ["System extension", "A capability close to the host", "Use a Frostyard sysext when the tool needs to integrate with the operating system: development tools, VPNs, editors, Docker, Podman, or Incus."], ["Podman + Distrobox", "Development userspaces", "Use containers when a project needs its own distribution, language toolchain, or library set. The project gets its environment; the host stays legible."], ["Docker", "Application workloads", "Use Docker when an application already ships as a container workflow. The Docker extension adds that runtime without making it part of the base image."], ["Incus", "System containers and VMs", "Use Incus when the workload needs a fuller machine boundary: long-lived system containers, virtual machines, or a test environment with its own operating system."]];
function FyWhyAtomic() {
  const h = {
    lineHeight: .95,
    letterSpacing: "-.075em",
    margin: 0,
    fontWeight: 700
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("header", {
    style: {
      padding: "7rem 0 5.5rem",
      maxWidth: 900
    }
  }, /*#__PURE__*/React.createElement(WaEyebrow, null, "Why atomic"), /*#__PURE__*/React.createElement("h1", {
    style: {
      ...h,
      fontSize: "clamp(3.3rem,6vw,6.3rem)"
    }
  }, "Change the tool.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("em", {
    style: {
      fontFamily: "var(--font-serif-accent)",
      fontWeight: 400,
      color: "var(--ice)"
    }
  }, "Not the ground beneath it.")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "1.08rem",
      color: "var(--mist)",
      maxWidth: 650,
      margin: "2rem 0 0"
    }
  }, "Atomic systems keep the operating system as a coherent, replaceable unit. That makes ordinary work less fragile: software choices have a boundary, updates have a known shape, and recovery does not begin with archaeology.")), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "3.5rem",
      border: "1px solid var(--line)",
      background: "linear-gradient(135deg,#0f3048,#091c2d)",
      display: "grid",
      gridTemplateColumns: ".8fr 1.2fr",
      gap: "4rem",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      height: 180,
      border: "1px solid #9cdef955",
      display: "grid",
      placeContent: "center",
      textAlign: "center",
      background: "radial-gradient(circle,#237ca444,transparent 65%)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "700 .75rem var(--font-mono)",
      letterSpacing: ".12em",
      color: "#d6f7ff",
      background: "#0d3450",
      padding: ".55rem .8rem",
      border: "1px solid #9cdef966"
    }
  }, "OS image"), /*#__PURE__*/React.createElement("i", {
    style: {
      height: 38,
      width: 1,
      background: "#78d7f4",
      display: "block",
      margin: "auto"
    }
  }), /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: ".7rem",
      textTransform: "uppercase",
      letterSpacing: ".13em",
      color: "#93dff7"
    }
  }, "Tools & workloads")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(WaEyebrow, null, "The protection is architectural"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "clamp(2.25rem,3.8vw,4rem)",
      lineHeight: 1,
      letterSpacing: "-.06em",
      margin: 0,
      fontWeight: 700
    }
  }, "A stable host is a smaller blast radius."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: ".93rem",
      color: "var(--mist)",
      margin: "1.3rem 0 0"
    }
  }, "The base image is updated as one tested deployment rather than as a long history of package transactions. Your configuration and data persist separately. If an update is wrong, the prior deployment remains a clear path back."))), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "7rem 0"
    }
  }, /*#__PURE__*/React.createElement(WaEyebrow, null, "What it avoids"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "clamp(2.25rem,3.8vw,4rem)",
      lineHeight: 1,
      letterSpacing: "-.06em",
      margin: 0,
      fontWeight: 700
    }
  }, "Normal systems break", /*#__PURE__*/React.createElement("br", null), "in familiar ways."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      marginTop: "3rem",
      borderTop: "1px solid var(--line)"
    }
  }, waBreakages.map(([title, body], index) => /*#__PURE__*/React.createElement("article", {
    key: title,
    style: {
      padding: index ? "2.4rem 2rem" : "2.4rem 2rem 2.4rem 0",
      borderBottom: "1px solid var(--line)",
      borderLeft: index ? "1px solid var(--line)" : "none"
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      font: "400 .7rem var(--font-mono)",
      color: "var(--sky)"
    }
  }, "0", index + 1), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "1.15rem",
      margin: ".8rem 0"
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: ".88rem",
      color: "var(--mist)",
      margin: 0
    }
  }, body))))), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: "5rem 0",
      borderTop: "1px solid var(--line)",
      display: "grid",
      gridTemplateColumns: ".85fr 1.15fr",
      gap: "5rem"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "sticky",
      top: "2rem",
      height: "max-content"
    }
  }, /*#__PURE__*/React.createElement(WaEyebrow, null, "Practical exits, not dead ends"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: "clamp(2.25rem,3.8vw,4rem)",
      lineHeight: 1,
      letterSpacing: "-.06em",
      margin: 0,
      fontWeight: 700
    }
  }, "Put each dependency", /*#__PURE__*/React.createElement("br", null), "at the right level."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: ".93rem",
      color: "var(--mist)",
      margin: "1.3rem 0 0"
    }
  }, "Immutable does not mean unable to install software. It means selecting the smallest boundary that fits the job.")), /*#__PURE__*/React.createElement("div", null, waPaths.map(([name, context, body], index) => /*#__PURE__*/React.createElement("article", {
    key: name,
    style: {
      display: "grid",
      gridTemplateColumns: "2.5rem 1fr",
      gap: "1rem",
      padding: "1.25rem 0",
      borderTop: "1px solid var(--line)",
      borderBottom: index === waPaths.length - 1 ? "1px solid var(--line)" : "none"
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      font: "400 .7rem var(--font-mono)",
      color: "var(--sky)"
    }
  }, "0", index + 1), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "1.15rem",
      margin: 0
    }
  }, name), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: ".67rem",
      textTransform: "uppercase",
      letterSpacing: ".12em",
      color: "#75c8e9",
      margin: ".3rem 0 .55rem"
    }
  }, context), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: ".88rem",
      color: "var(--mist)",
      margin: 0
    }
  }, body)))))));
}
window.FyWhyAtomic = FyWhyAtomic;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/frostyard-org/WhyAtomic.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pilothouse/Screens.jsx
try { (() => {
// Pilothouse screens — data mirrors the real module inventory (sysext, services, podman, docker, incus, system)
const phSysexts = [["podman", "Podman + Distrobox", "5.4.2+ds1-2+b2", "merged", null], ["docker", "Docker CE", "5+29.4.1-1~debian.13~trixie", "merged", "update"], ["tailscale", "Tailscale", "1.98.3", "merged", null], ["vscode", "Visual Studio Code", "1.127.0-1782814776", "installed", "update"], ["incus", "Incus", "1+7.2-debian13-202607011341+r1", "merged", null], ["dev", "Development tools", "12.12", "installed", null]];
const phServices = [["pilothouse.service", "Web console", "active", "enabled"], ["pilothoused.service", "Action broker", "active", "enabled"], ["podman.socket", "Podman API socket", "active", "enabled"], ["systemd-sysupdate.timer", "Update timer", "active", "enabled"], ["docker.service", "Docker engine", "failed", "enabled"], ["tailscaled.service", "Tailscale daemon", "active", "enabled"]];
const phContainers = [["registry", "docker.io/library/registry:3", "running", "2 weeks"], ["forgejo", "codeberg.org/forgejo/forgejo:13", "running", "2 weeks"], ["runner-1", "code.forgejo.org/forgejo/runner:11", "running", "4 days"], ["backup", "docker.io/offen/docker-volume-backup:v2", "exited", "6 hours"]];
window.phFleet = [{
  id: "workstation-01",
  image: "snow",
  role: "Desktop",
  os: "snow 2026.07",
  kernel: "6.15.4-bpo",
  uptime: "11 days",
  cpu: 23,
  cores: "8 cores",
  load: "0.84",
  mem: 41,
  memUsed: "13.1 GB used",
  memTot: "32 GB",
  disk: 62,
  diskUsed: "290 GB used",
  diskTot: "468 GB",
  updates: 2,
  attention: 3,
  state: "ok",
  heroA: "The system below is ",
  heroEm: "calm.",
  heroP: "Snow 2026.07 on the current deployment. Previous deployment retained. 2 extension updates are staged and waiting."
}, {
  id: "surface-go",
  image: "snowfield",
  role: "Surface",
  os: "snowfield 2026.07",
  kernel: "6.15.4-surface",
  uptime: "3 days",
  cpu: 12,
  cores: "4 cores",
  load: "0.31",
  mem: 55,
  memUsed: "8.7 GB used",
  memTot: "16 GB",
  disk: 38,
  diskUsed: "97 GB used",
  diskTot: "256 GB",
  updates: 0,
  attention: 0,
  state: "ok",
  heroA: "Tuned for the hardware. ",
  heroEm: "Still boring.",
  heroP: "Snowfield with the linux-surface kernel. No staged updates; nothing needs attention."
}, {
  id: "cayo-01",
  image: "cayo",
  role: "Server",
  os: "cayo 2026.07",
  kernel: "6.12.30",
  uptime: "84 days",
  cpu: 8,
  cores: "16 cores",
  load: "0.42",
  mem: 33,
  memUsed: "21 GB used",
  memTot: "64 GB",
  disk: 71,
  diskUsed: "1.4 TB used",
  diskTot: "2 TB",
  updates: 1,
  attention: 1,
  state: "warn",
  heroA: "A quiet base, ",
  heroEm: "doing its job.",
  heroP: "Headless Cayo running the container workloads. Storage is above 70% and one extension update is staged."
}, {
  id: "cayo-02",
  image: "cayo",
  role: "Server",
  os: "cayo 2026.06",
  kernel: "6.12.27",
  uptime: "126 days",
  cpu: 4,
  cores: "8 cores",
  load: "0.11",
  mem: 19,
  memUsed: "5.8 GB used",
  memTot: "32 GB",
  disk: 44,
  diskUsed: "410 GB used",
  diskTot: "1 TB",
  updates: 1,
  attention: 1,
  state: "danger",
  heroA: "One deployment ",
  heroEm: "behind.",
  heroP: "Running last month's image with docker.service failed. Update is staged; reboot when the workload allows."
}];
const phAttention = [["docker.service failed", "unit entered failed state · 12 min ago", "danger", "Failed unit"], ["Storage above 60%", "/var at 62% of 468 GB", "warn", "Disk"], ["2 sysext updates", "docker, vscode have newer versions", "warn", "Updates"]];
function PhBadge({
  tone,
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "ph-badge " + (tone || "")
  }, children);
}
function PhCardHeading({
  title,
  sub,
  link
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ph-card-heading split"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, title), sub && /*#__PURE__*/React.createElement("p", null, sub)), link && /*#__PURE__*/React.createElement("a", {
    href: "#",
    className: "ph-card-link",
    onClick: e => e.preventDefault()
  }, link, " \u2192"));
}
function PhMetric({
  label,
  value,
  unit,
  pct,
  tone,
  foot
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ph-card ph-metric"
  }, /*#__PURE__*/React.createElement(PhCardHeading, {
    title: label
  }), /*#__PURE__*/React.createElement("div", {
    className: "ph-metric-row"
  }, /*#__PURE__*/React.createElement("strong", null, value), /*#__PURE__*/React.createElement("span", null, unit)), /*#__PURE__*/React.createElement("div", {
    className: "ph-meter " + (tone || "")
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: pct + "%"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "ph-metric-foot"
  }, /*#__PURE__*/React.createElement("span", null, foot[0]), /*#__PURE__*/React.createElement("span", null, foot[1])));
}
function PhOverview({
  go,
  sys
}) {
  const heroImgs = {
    snow: "moonlit-summit",
    snowfield: "alpine-morning",
    cayo: "frozen-reflection"
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "ph-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-card ph-hero ph-span-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-hero-art"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/hero/" + (heroImgs[sys.image] || "moonlit-summit") + ".png",
    alt: ""
  })), /*#__PURE__*/React.createElement("div", {
    className: "ph-hero-kicker"
  }, /*#__PURE__*/React.createElement("span", null), sys.image, " \xB7 ", sys.id), /*#__PURE__*/React.createElement("h2", null, sys.heroA, /*#__PURE__*/React.createElement("em", null, sys.heroEm)), /*#__PURE__*/React.createElement("p", null, sys.heroP), /*#__PURE__*/React.createElement("table", {
    className: "ph-facts"
  }, /*#__PURE__*/React.createElement("tbody", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "OS"), /*#__PURE__*/React.createElement("th", null, "Kernel"), /*#__PURE__*/React.createElement("th", null, "Uptime")), /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null, sys.os), /*#__PURE__*/React.createElement("td", null, sys.kernel), /*#__PURE__*/React.createElement("td", null, sys.uptime))))), /*#__PURE__*/React.createElement("div", {
    className: "ph-span-third"
  }, /*#__PURE__*/React.createElement(PhMetric, {
    label: "CPU",
    value: sys.cpu,
    unit: "%",
    pct: sys.cpu,
    foot: [sys.cores, "load " + sys.load]
  })), /*#__PURE__*/React.createElement("div", {
    className: "ph-span-third"
  }, /*#__PURE__*/React.createElement(PhMetric, {
    label: "Memory",
    value: sys.mem,
    unit: "%",
    pct: sys.mem,
    foot: [sys.memUsed, sys.memTot]
  })), /*#__PURE__*/React.createElement("div", {
    className: "ph-span-third"
  }, /*#__PURE__*/React.createElement(PhMetric, {
    label: "Storage /var",
    value: sys.disk,
    unit: "%",
    tone: sys.disk > 60 ? "warn" : "",
    pct: sys.disk,
    foot: [sys.diskUsed, sys.diskTot]
  })), /*#__PURE__*/React.createElement("div", {
    className: "ph-card ph-span-half"
  }, /*#__PURE__*/React.createElement(PhCardHeading, {
    title: "Needs attention",
    sub: "disk \xB7 memory \xB7 load \xB7 failed units",
    link: "View all"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ph-mini"
  }, phAttention.map(([t, s, tone, badge]) => /*#__PURE__*/React.createElement("div", {
    className: "ph-mini-row",
    key: t
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, t), /*#__PURE__*/React.createElement("small", null, s)), /*#__PURE__*/React.createElement(PhBadge, {
    tone: tone
  }, badge))))), /*#__PURE__*/React.createElement("div", {
    className: "ph-card ph-span-half"
  }, /*#__PURE__*/React.createElement(PhCardHeading, {
    title: "Services",
    sub: "units with lifecycle controls",
    link: "Manage"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ph-mini"
  }, phServices.slice(0, 3).map(([name, desc, state]) => /*#__PURE__*/React.createElement("div", {
    className: "ph-mini-row",
    key: name
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, name), /*#__PURE__*/React.createElement("small", null, desc)), /*#__PURE__*/React.createElement(PhBadge, {
    tone: state === "active" ? "ok" : "danger"
  }, state))))), /*#__PURE__*/React.createElement("div", {
    className: "ph-card ph-table-card ph-span-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-table-toolbar"
  }, /*#__PURE__*/React.createElement("h2", null, "System extensions"), /*#__PURE__*/React.createElement("span", null, "6 installed \xB7 2 updates")), /*#__PURE__*/React.createElement("table", {
    className: "ph-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Extension"), /*#__PURE__*/React.createElement("th", null, "Version"), /*#__PURE__*/React.createElement("th", null, "State"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Actions"))), /*#__PURE__*/React.createElement("tbody", null, phSysexts.slice(0, 4).map(([id, label, v, state, upd]) => /*#__PURE__*/React.createElement("tr", {
    key: id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ph-name"
  }, /*#__PURE__*/React.createElement("strong", null, label), /*#__PURE__*/React.createElement("small", null, id))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "ph-version"
  }, v)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(PhBadge, {
    tone: "ok"
  }, state), upd && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6
    }
  }, /*#__PURE__*/React.createElement(PhBadge, {
    tone: "warn"
  }, "update"))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ph-actions"
  }, upd && /*#__PURE__*/React.createElement("button", {
    className: "ph-button"
  }, "Update"), /*#__PURE__*/React.createElement("button", {
    className: "ph-button secondary"
  }, "Details")))))))));
}
function PhSysexts() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-card ph-table-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-table-toolbar"
  }, /*#__PURE__*/React.createElement("h2", null, "System extensions"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "ph-button secondary"
  }, "Refresh merge"), /*#__PURE__*/React.createElement("button", {
    className: "ph-button"
  }, "Update all"))), /*#__PURE__*/React.createElement("table", {
    className: "ph-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Extension"), /*#__PURE__*/React.createElement("th", null, "Version"), /*#__PURE__*/React.createElement("th", null, "State"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Actions"))), /*#__PURE__*/React.createElement("tbody", null, phSysexts.map(([id, label, v, state, upd]) => /*#__PURE__*/React.createElement("tr", {
    key: id
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ph-name"
  }, /*#__PURE__*/React.createElement("strong", null, label), /*#__PURE__*/React.createElement("small", null, id, " \xB7 /usr/lib/sysupdate.", id, ".d"))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "ph-version"
  }, v)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(PhBadge, {
    tone: state === "merged" ? "ok" : ""
  }, state), upd && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6
    }
  }, /*#__PURE__*/React.createElement(PhBadge, {
    tone: "warn"
  }, "update"))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ph-actions"
  }, upd && /*#__PURE__*/React.createElement("button", {
    className: "ph-button"
  }, "Update"), /*#__PURE__*/React.createElement("button", {
    className: "ph-button danger"
  }, "Remove")))))))));
}
function PhServices() {
  return /*#__PURE__*/React.createElement("div", {
    className: "ph-card ph-table-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-table-toolbar"
  }, /*#__PURE__*/React.createElement("h2", null, "Services, sockets & timers"), /*#__PURE__*/React.createElement("span", null, phServices.length, " units")), /*#__PURE__*/React.createElement("table", {
    className: "ph-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Unit"), /*#__PURE__*/React.createElement("th", null, "State"), /*#__PURE__*/React.createElement("th", null, "Enablement"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Actions"))), /*#__PURE__*/React.createElement("tbody", null, phServices.map(([name, desc, state, enab]) => /*#__PURE__*/React.createElement("tr", {
    key: name
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ph-name"
  }, /*#__PURE__*/React.createElement("strong", null, name), /*#__PURE__*/React.createElement("small", null, desc))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(PhBadge, {
    tone: state === "active" ? "ok" : "danger"
  }, state)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(PhBadge, null, enab)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ph-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "ph-button secondary"
  }, state === "failed" ? "Restart" : "Stop"), /*#__PURE__*/React.createElement("button", {
    className: "ph-button secondary"
  }, "Logs"))))))));
}
function PhPodman() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-stat"
  }, /*#__PURE__*/React.createElement("span", null, "Engine"), /*#__PURE__*/React.createElement("strong", {
    className: "ph-version"
  }, "podman 5.4.2"), /*#__PURE__*/React.createElement("small", null, "system store")), /*#__PURE__*/React.createElement("div", {
    className: "ph-stat"
  }, /*#__PURE__*/React.createElement("span", null, "Containers"), /*#__PURE__*/React.createElement("strong", null, "4"), /*#__PURE__*/React.createElement("small", null, "3 running")), /*#__PURE__*/React.createElement("div", {
    className: "ph-stat"
  }, /*#__PURE__*/React.createElement("span", null, "Images"), /*#__PURE__*/React.createElement("strong", null, "11"), /*#__PURE__*/React.createElement("small", null, "4.2 GB reported")), /*#__PURE__*/React.createElement("div", {
    className: "ph-stat"
  }, /*#__PURE__*/React.createElement("span", null, "Pods"), /*#__PURE__*/React.createElement("strong", null, "1"), /*#__PURE__*/React.createElement("small", null, "infra shared"))), /*#__PURE__*/React.createElement("div", {
    className: "ph-card ph-table-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-table-toolbar"
  }, /*#__PURE__*/React.createElement("h2", null, "Containers"), /*#__PURE__*/React.createElement("span", null, "system podman \xB7 bounded logs")), /*#__PURE__*/React.createElement("table", {
    className: "ph-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Container"), /*#__PURE__*/React.createElement("th", null, "Image"), /*#__PURE__*/React.createElement("th", null, "State"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Actions"))), /*#__PURE__*/React.createElement("tbody", null, phContainers.map(([name, image, state, age]) => /*#__PURE__*/React.createElement("tr", {
    key: name
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ph-name"
  }, /*#__PURE__*/React.createElement("strong", null, name), /*#__PURE__*/React.createElement("small", null, "up ", age))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "ph-version"
  }, image)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(PhBadge, {
    tone: state === "running" ? "ok" : ""
  }, state)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ph-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "ph-button secondary"
  }, state === "running" ? "Stop" : "Start"), /*#__PURE__*/React.createElement("button", {
    className: "ph-button secondary"
  }, "Logs")))))))));
}
function PhFleet({
  current,
  onPick
}) {
  const stateBadge = {
    ok: ["ok", "healthy"],
    warn: ["warn", "attention"],
    danger: ["danger", "degraded"]
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "ph-card ph-table-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-table-toolbar"
  }, /*#__PURE__*/React.createElement("h2", null, "Fleet"), /*#__PURE__*/React.createElement("span", null, window.phFleet.length, " systems \xB7 same base, deliberate layers")), /*#__PURE__*/React.createElement("table", {
    className: "ph-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "System"), /*#__PURE__*/React.createElement("th", null, "Image"), /*#__PURE__*/React.createElement("th", null, "Deployment"), /*#__PURE__*/React.createElement("th", null, "State"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: "right"
    }
  }, "Actions"))), /*#__PURE__*/React.createElement("tbody", null, window.phFleet.map(sys => {
    const [tone, label] = stateBadge[sys.state];
    return /*#__PURE__*/React.createElement("tr", {
      key: sys.id,
      style: sys.id === current ? {
        background: "rgba(71,184,239,.05)"
      } : null
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      className: "ph-name"
    }, /*#__PURE__*/React.createElement("strong", null, sys.id, sys.id === current ? " ·" : "", " ", sys.id === current && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--sky)",
        fontWeight: 400,
        fontSize: 10
      }
    }, "connected")), /*#__PURE__*/React.createElement("small", null, sys.role.toLowerCase(), " \xB7 up ", sys.uptime))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      className: "ph-version"
    }, sys.os)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      className: "ph-version"
    }, sys.kernel), sys.updates > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6
      }
    }, /*#__PURE__*/React.createElement(PhBadge, {
      tone: "warn"
    }, sys.updates, " update", sys.updates > 1 ? "s" : ""))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(PhBadge, {
      tone: tone
    }, label)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      className: "ph-actions"
    }, /*#__PURE__*/React.createElement("button", {
      className: "ph-button",
      onClick: () => onPick(sys.id)
    }, "Open"))));
  }))));
}
function PhLogin({
  onLogin
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ph-login-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-login"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ph-login-panel"
  }, /*#__PURE__*/React.createElement("a", {
    className: "ph-brand",
    href: "#",
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "flake"
  }, "\u2744"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, "Pilothouse"), /*#__PURE__*/React.createElement("small", null, "frostyard admin"))), /*#__PURE__*/React.createElement("div", {
    className: "ph-login-copy"
  }, /*#__PURE__*/React.createElement("h1", null, "Sign in to the ", /*#__PURE__*/React.createElement("em", null, "quiet cockpit.")), /*#__PURE__*/React.createElement("p", null, "Pilothouse uses this machine's own accounts and policy. Any account can view the dashboard; administrators can act on extensions, services, and containers."), /*#__PURE__*/React.createElement("form", {
    className: "ph-login-form",
    onSubmit: e => {
      e.preventDefault();
      onLogin();
    }
  }, /*#__PURE__*/React.createElement("label", null, "Username", /*#__PURE__*/React.createElement("input", {
    defaultValue: "bjk",
    autoComplete: "username"
  })), /*#__PURE__*/React.createElement("label", null, "Password", /*#__PURE__*/React.createElement("input", {
    type: "password",
    defaultValue: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    autoComplete: "current-password"
  })), /*#__PURE__*/React.createElement("button", {
    className: "ph-button",
    type: "submit",
    style: {
      justifyContent: "center",
      minHeight: 43,
      width: "100%"
    }
  }, "Sign in"))), /*#__PURE__*/React.createElement("p", {
    className: "ph-login-foot"
  }, "Loopback-only by default. Cold systems. Clear boundaries.")), /*#__PURE__*/React.createElement("div", {
    className: "ph-login-art"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/hero/frozen-reflection.png",
    alt: ""
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", null, "snow \xB7 workstation-01"), /*#__PURE__*/React.createElement("strong", null, "Keep the base still. Move with intent.")))));
}
Object.assign(window, {
  PhOverview,
  PhSysexts,
  PhServices,
  PhPodman,
  PhLogin,
  PhFleet
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pilothouse/Screens.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.SectionHeading = __ds_scope.SectionHeading;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.ImageCard = __ds_scope.ImageCard;

__ds_ns.NavBar = __ds_scope.NavBar;

__ds_ns.SiteFooter = __ds_scope.SiteFooter;

})();
