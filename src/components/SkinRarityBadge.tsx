import { RARITY_LABELS, type SkinRarity } from "../lib/skinRarity";
export default function SkinRarityBadge({ rarity }: { rarity: SkinRarity | null }) {
  if (!rarity) return null;
  return (
    <span
      className="skin-rarity-badge"
      data-rarity={rarity}
      aria-label={`Skin rarity: ${RARITY_LABELS[rarity]}`}
    >
      <i aria-hidden="true" />
      {RARITY_LABELS[rarity]}
    </span>
  );
}
