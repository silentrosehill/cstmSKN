export const RARITY_LABELS = {
  standard: "Standard",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  mythic: "Mythic",
  ultimate: "Ultimate",
  exalted: "Exalted",
  transcendent: "Transcendent",
} as const;
export type SkinRarity = keyof typeof RARITY_LABELS;
export interface SkinMetadata {
  rarities: Record<string, SkinRarity>;
  chromas: Record<string, { colors: string[]; parentId: number }>;
}
const RIOT_RARITIES: Record<string, SkinRarity> = {
  kNoRarity: "standard",
  kRare: "rare",
  kEpic: "epic",
  kLegendary: "legendary",
  kMythic: "mythic",
  kUltimate: "ultimate",
  kExalted: "exalted",
  kTranscendent: "transcendent",
};
interface ClientSkin {
  id: number | string;
  rarity?: string;
  chromas?: { id: number | string; colors?: unknown[] }[] | null;
}
export function parseSkinMetadata(data: unknown): SkinMetadata {
  if (!data || typeof data !== "object") throw new Error("Skin metadata unavailable");
  const skins = Object.values(data).filter(
    (skin): skin is ClientSkin =>
      !!skin && typeof skin === "object" && /^\d+$/.test(String(skin.id))
  );
  if (!skins.length) throw new Error("Skin metadata unavailable");
  const rarities: SkinMetadata["rarities"] = {},
    chromas: SkinMetadata["chromas"] = {};
  for (const skin of skins) {
    const rarity = typeof skin.rarity === "string" ? RIOT_RARITIES[skin.rarity] : undefined;
    if (rarity) rarities[String(skin.id)] = rarity;
  }
  for (const skin of skins) {
    if (!Array.isArray(skin.chromas)) continue;
    for (const chroma of skin.chromas) {
      if (!chroma || !/^\d+$/.test(String(chroma.id))) continue;
      const id = String(chroma.id);
      chromas[id] = {
        parentId: Number(skin.id),
        colors: (Array.isArray(chroma.colors) ? chroma.colors : []).filter(
          (color): color is string => typeof color === "string" && /^#[\da-f]{6}$/i.test(color)
        ),
      };
      if (!rarities[id] && rarities[String(skin.id)]) rarities[id] = rarities[String(skin.id)];
    }
  }
  return { rarities, chromas };
}
export function skinRarity(
  rarities: Record<string, SkinRarity>,
  skinId: string | undefined,
  parentId?: string
): SkinRarity | null {
  return (
    (skinId ? rarities[skinId] : undefined) ?? (parentId ? rarities[parentId] : undefined) ?? null
  );
}
