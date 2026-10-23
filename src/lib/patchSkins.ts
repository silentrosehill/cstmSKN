import type { Champion, Skin } from "../types";
export interface RiotSkin {
  id: string | number;
  num: number;
  name: string;
  chromas?: boolean;
  parentSkin?: number | string | null;
}
export interface RiotChampion extends Champion {
  skins: RiotSkin[];
}
export interface RiotRoster {
  data: Record<string, RiotChampion>;
}
export interface PatchSkin {
  champion: Champion;
  skin: Skin;
}
export interface PatchHighlights {
  version: string;
  previousVersion: string;
  skins: PatchSkin[];
}
const patchKey = (version: string) => version.split(".").slice(0, 2).join(".");
export function patchVersions(versions: string[]): { current: string; previous: string } {
  const stable = versions.filter((version) => /^\d+\.\d+\.\d+$/.test(version));
  const current = stable[0];
  const previous = stable.find((version) => patchKey(version) !== patchKey(current));
  if (!current || !previous) throw new Error("Patch comparison unavailable");
  return { current, previous };
}
export function patchLabel(version: string): string {
  const [season, patch] = version.split(".").map(Number);
  // Riot switched public patch names from season numbers to years in 2025.
  return `${season >= 15 ? season + 10 : season}.${patch}`;
}
export function newPatchSkins(current: RiotRoster, previous: RiotRoster): PatchSkin[] {
  if (!current.data || !previous.data || Object.keys(previous.data).length === 0)
    throw new Error("Patch data unavailable");
  const existing = new Set(
    Object.values(previous.data).flatMap((champion) =>
      (champion.skins ?? []).map((skin) => String(skin.id))
    )
  );
  return Object.values(current.data)
    .filter((champion) => Number(champion.key) < 60000 && !champion.id.startsWith("Jade_"))
    .flatMap(({ skins, id, key, name, title, tags }) => {
      const champion: Champion = { id, key, name, title, tags };
      return (skins ?? [])
        .filter(
          (skin) => skin.num !== 0 && skin.parentSkin == null && !existing.has(String(skin.id))
        )
        .map((skin) => ({
          champion,
          skin: {
            id: String(skin.id),
            num: skin.num,
            name: skin.name,
            championId: id,
            championName: name,
          },
        }));
    })
    .sort(
      (a, b) =>
        a.champion.name.localeCompare(b.champion.name, "en") ||
        a.skin.name.localeCompare(b.skin.name, "en")
    );
}
