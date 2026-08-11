import { Tag } from "../core/Tag.jsx";
const heroScenes = ["moonlit-summit", "alpine-morning", "frozen-reflection", "blueprint"];
export function ImageCard({ type, index = 0, name, title, body, tags = [], href = "#", artSrc, assetsBase = "../../assets" }) {
  const grads = ["var(--gradient-card)", "var(--gradient-card-alt)", "var(--gradient-card-deep)"];
  const src = artSrc || assetsBase + "/hero/" + heroScenes[index % heroScenes.length] + ".png";
  return <article style={{ minHeight: 425, border: "1px solid var(--line)", background: grads[index % 3], padding: "var(--card-pad)", position: "relative", overflow: "hidden", fontFamily: "var(--font-sans)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: ".68rem", textTransform: "uppercase", letterSpacing: ".09em", color: "#9bcbdf" }}><span>{type}</span><b style={{ fontWeight: 400, color: "#6b93a8" }}>0{index + 1}</b></div>
    <div aria-hidden="true" style={{ height: 125, position: "relative", margin: "1rem -1.35rem 1.3rem", overflow: "hidden" }}>
      <img src={src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "220%", objectFit: "cover", objectPosition: "50% 58%", display: "block" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(6,17,29,.25),transparent 40%,rgba(9,28,45,.55))" }}></div>
    </div>
    <h3 style={{ fontSize: "2rem", letterSpacing: "-.06em", margin: 0 }}><a href={href} style={{ color: "var(--text-body)", textDecoration: "none" }}>{name}</a></h3>
    <h4 style={{ fontSize: "1rem", margin: ".5rem 0", color: "#e7f8ff", fontWeight: 600 }}>{title}</h4>
    <p style={{ fontSize: ".87rem", color: "#b5cedb", margin: 0 }}>{body}</p>
    <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap", marginTop: "1.4rem" }}>{tags.map(t => <Tag key={t}>{t}</Tag>)}</div>
  </article>;
}