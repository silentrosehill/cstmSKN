import type { Champion, Skin, SkinGroup } from "../types";

export function searchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/['’/]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesSearch(value: string, query: string): boolean {
  const text = searchText(value);
  return searchText(query)
    .split(/\s+/)
    .every((word) => text.includes(word));
}

export interface SkinSearchEntry {
  champion: Champion;
  skin: Skin;
  text: string;
}

export function buildSkinIndex(
  champions: Champion[],
  ids: Record<string, string>
): SkinSearchEntry[] {
  const byKey = new Map(champions.map((champion) => [Number(champion.key), champion]));
  const entries: SkinSearchEntry[] = [];
  for (const [id, name] of Object.entries(ids)) {
    if (!/^\d+$/.test(id) || typeof name !== "string") continue;
    const numericId = Number(id),
      num = numericId % 1000;
    const champion = byKey.get(Math.floor(numericId / 1000));
    if (!champion || num === 0) continue;
    entries.push({
      champion,
      skin: {
        id,
        num,
        name,
        championId: champion.id,
        championName: ids[String(Number(champion.key) * 1000)] ?? champion.name,
      },
      text: searchText(`${name} ${champion.name}`),
    });
  }
  return entries;
}

export function searchSkins(entries: SkinSearchEntry[], query: string): SkinSearchEntry[] {
  const text = searchText(query);
  if (!text) return [];
  const words = text.split(/\s+/);
  const rank = (entry: SkinSearchEntry) => {
    const name = searchText(entry.skin.name);
    return (
      (name === text ? 0 : name.startsWith(text) ? 1 : name.includes(text) ? 2 : 3) +
      (/\([^)]+\)$/.test(entry.skin.name) ? 0.25 : 0)
    );
  };
  return entries
    .filter((entry) => words.every((word) => entry.text.includes(word)))
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.skin.name.localeCompare(b.skin.name, "en") ||
        a.champion.name.localeCompare(b.champion.name, "en")
    );
}

export function letterSections(champions: Champion[]): { letter: string; champions: Champion[] }[] {
  const sections = new Map<string, Champion[]>();
  for (const champion of champions) {
    const letter = searchText(champion.name).charAt(0).toUpperCase() || "#";
    if (!sections.has(letter)) sections.set(letter, []);
    sections.get(letter)!.push(champion);
  }
  return [...sections].map(([letter, champions]) => ({ letter, champions }));
}

export function galleryTarget(
  groups: SkinGroup[],
  skinId: string | null | undefined
): { index: number; chromaId: string | null } | null {
  if (!skinId) return null;
  const index = groups.findIndex(
    (group) =>
      group.base.id === skinId ||
      group.chromas.some((chroma) => chroma.id === skinId) ||
      !!group.forms?.some((form) => form.id === skinId)
  );
  if (index < 0) return null;
  return { index, chromaId: groups[index].base.id === skinId ? null : skinId };
}
