// /dev/fx (unlinked): every canvas resolving effect on a real card, side by side, to judge them by eye.
import { cardImage } from "../api.ts";
import { ResolveFx } from "../components/duel/ResolveFx.tsx";

const STYLES = ["frost", "powerup", "holy", "void", "electric", "circle", "sparkle", "fireworks", "rings", "aura"] as const;
const COLORS: Record<string, string> = { frost: "#9fe6ff", powerup: "#ffd23f", holy: "#ffe9a3", void: "#a35cff", electric: "#5fe3ff", circle: "#8f7bff", sparkle: "#8f7bff", fireworks: "#8f7bff", rings: "#8f7bff", aura: "#ff7a2a" };

export default function FxLab() {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h1>Resolving effects</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "90px 40px", padding: "80px 60px", background: "#0d0f1a", borderRadius: 12 }}>
        {STYLES.map((s) => (
          <figure key={s} style={{ margin: 0, display: "grid", justifyItems: "center", gap: 70 }}>
            <span style={{ position: "relative", width: 120, aspectRatio: "59 / 86", ["--src-c" as string]: COLORS[s] }}>
              <img src={cardImage(14558127, "full")} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, borderRadius: 4 }} />
              <ResolveFx style={s} />
            </span>
            <figcaption className="muted">{s}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
