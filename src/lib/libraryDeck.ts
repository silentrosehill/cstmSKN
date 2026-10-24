import type { DownloadedSkin } from "../types/index.ts";

export interface LibraryGroup {
  name: string;
  champion: string;
  base: DownloadedSkin | null;
  chromas: { download: DownloadedSkin; colors: string[]; image?: string }[];
}
export interface ChampionDeck {
  champion: string;
  groups: LibraryGroup[];
}
export type ChromaLookup = (
  name: string
) => { parentName: string; colors: string[]; image?: string } | null;

export function groupLibrarySkins(
  downloads: DownloadedSkin[],
  chromaInfo: ChromaLookup
): ChampionDeck[] {
  const champions = new Map<string, Map<string, LibraryGroup>>();
  const seen = new Set<string>();
  for (const download of downloads) {
    const key = `${download.champion_name}\0${download.skin_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const chroma = chromaInfo(download.skin_name);
    const name = chroma?.parentName ?? download.skin_name;
    const groups = champions.get(download.champion_name) ?? new Map<string, LibraryGroup>();
    const group = groups.get(name) ?? {
      name,
      champion: download.champion_name,
      base: null,
      chromas: [],
    };
    if (chroma) group.chromas.push({ download, colors: chroma.colors, image: chroma.image });
    else group.base = download;
    groups.set(name, group);
    champions.set(download.champion_name, groups);
  }
  return [...champions]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([champion, groups]) => ({
      champion,
      groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
export function groupDownloads(group: LibraryGroup): DownloadedSkin[] {
  return [...(group.base ? [group.base] : []), ...group.chromas.map((chroma) => chroma.download)];
}
export function deckFrontIndex(
  groups: LibraryGroup[],
  selected: string | undefined,
  lastFront?: string
): number {
  const selectedIndex = selected
    ? groups.findIndex((group) =>
        groupDownloads(group).some((download) => download.skin_name === selected)
      )
    : -1;
  if (selectedIndex >= 0) return selectedIndex;
  const remembered = groups.findIndex((group) => group.name === lastFront);
  return Math.max(0, remembered);
}
export function deckVariant(group: LibraryGroup, preferred?: string): DownloadedSkin {
  const variants = groupDownloads(group);
  const download = variants.find((download) => download.skin_name === preferred) ?? variants[0];
  if (!download) throw new Error("This champion has no downloaded skin.");
  return download;
}
export function deckTarget(index: number, length: number, direction: number): number {
  return length ? (((index + direction) % length) + length) % length : 0;
}
