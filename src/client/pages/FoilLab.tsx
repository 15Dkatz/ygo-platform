// /dev/foils (unlinked): every foil, large, to check them by eye: the named rarities on a few cards,
// then each picture style and each lettering style on its own.
import { LETTERINGS, LETTERING_LABEL, PICTURES, PICTURE_LABEL, RARITIES, RARITY_LABEL, foilOf, type Rarity } from "../../shared/rarity.ts";
import { cardImage } from "../api.ts";
import { RarityFoil, useFoilPointer } from "../components/cards/Rarity.tsx";

const CARDS = [
  { code: 14558127, type: "Tuner Monster" },        // Ash Blossom (orange frame, dark name)
  { code: 44362883, type: "Spell Card" },           // Branded Fusion (light name)
  { code: 89392810, type: "Tuner Monster" },        // Kewl Tune Reco
];

function Row({ title, items }: { title: string; items: { key: string; label: string; foil: Rarity; card: (typeof CARDS)[number] }[] }) {
  return (
    <>
      <h2>{title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
        {items.map((it) => (
          <figure key={it.key} style={{ margin: 0 }}>
            <span data-foil={it.foil} style={{ position: "relative", display: "block", lineHeight: 0, overflow: "hidden", borderRadius: 4 }}>
              <img src={cardImage(it.card.code, "full")} alt="" style={{ width: "100%" }} />
              <RarityFoil rarity={it.foil} type={it.card.type} code={it.card.code} />
            </span>
            <figcaption className="muted" style={{ fontSize: 12 }}>{it.label}</figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}

export default function FoilLab() {
  useFoilPointer();
  const ash = CARDS[0], reco = CARDS[2], spell = CARDS[1];
  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1>Foils</h1>
      {CARDS.map((c) => (
        <Row key={c.code} title={`Rarities · ${c.code}`} items={RARITIES.map((r) => ({ key: r, label: RARITY_LABEL[r], foil: r, card: c }))} />
      ))}
      <Row title="Pictures (lettering: none)" items={PICTURES.map((p) => ({ key: p, label: PICTURE_LABEL[p], foil: foilOf("none", p), card: p.length % 2 ? ash : reco }))} />
      <Row title="Lettering (picture: none)" items={LETTERINGS.flatMap((l) => [ash, spell].map((c) => ({ key: `${l}${c.code}`, label: LETTERING_LABEL[l], foil: foilOf(l, "none"), card: c })))} />
    </section>
  );
}
