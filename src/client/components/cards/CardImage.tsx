import { useState } from "react";
import type { Card } from "../../../shared/types.ts";
import { cardImage } from "../../api.ts";
import { categoryClass } from "./cardInfo.ts";
import "./cards.css";

interface Props {
  card: Pick<Card, "id" | "name" | "category">;
  size?: "small" | "full" | "crop";
  className?: string;
  /** Unknown cards (not in the catalogue) get a placeholder instead of a broken image. */
  eager?: boolean;
}

/** Card art through our Worker's image proxy, with a placeholder for unknown / failed images. */
export function CardImage({ card, size = "small", className = "", eager }: Props) {
  const [failedId, setFailedId] = useState<number | null>(null);
  const failed = failedId === card.id;
  if (card.category === "Unknown" || failed) {
    return (
      <div className={`card-img card-ph ph-${categoryClass(card)} ${className}`} role="img" aria-label={card.name}>
        <span>{card.category === "Unknown" ? `#${card.id}` : card.name}</span>
      </div>
    );
  }
  return (
    <img
      className={`card-img ${className}`}
      src={cardImage(card.id, size)}
      alt={card.name}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => setFailedId(card.id)}
    />
  );
}
