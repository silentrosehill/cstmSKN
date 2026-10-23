import type { Champion, CustomMod, DownloadedSkin, Skin } from "../types";
import { modKind, modsConflict } from "./mods.ts";

export interface Loadout {
  skins: Record<string, string>;
  customs: string[];
}
export type ChampionAssignments = Record<string, string>;
export function galleryIndex(current: number, total: number, delta: number): number {
  return total <= 0 ? 0 : (((current + delta) % total) + total) % total;
}
const normalized = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
export function championKey(name: string, champions: Champion[]): string {
  const key = normalized(name);
  const found = champions.find((c) => normalized(c.name) === key || normalized(c.id) === key);
  return normalized(found?.id ?? name);
}
export function customTargets(
  mod: CustomMod,
  champions: Champion[],
  assignments: ChampionAssignments
): string[] {
  const detected = [
    ...new Set(
      (mod.champions ?? []).flatMap((name) => {
        const match = champions.find(
          (c) =>
            normalized(c.id) === normalized(name) ||
            normalized(c.name) === normalized(name) ||
            c.key === name
        );
        return match ? [championKey(match.id, champions)] : [];
      })
    ),
  ];
  if (detected.length) return detected;
  const assigned = assignments[mod.name];
  if (assigned) return [championKey(assigned, champions)];
  // A single unambiguous champion in an archive's display name is a last resort.
  const words = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const name = ` ${words(mod.name)} `;
  const matches = champions.filter((c) =>
    [c.id, c.name].some((alias) => name.includes(` ${words(alias)} `))
  );
  return matches.length === 1 ? [championKey(matches[0].id, champions)] : [];
}
export function chooseSkin(
  loadout: Loadout,
  skin: Pick<Skin, "championName" | "name">,
  enabled: boolean,
  mods: CustomMod[],
  champions: Champion[],
  assignments: ChampionAssignments
): Loadout {
  const skins = { ...loadout.skins };
  if (!enabled) {
    if (skins[skin.championName] === skin.name) delete skins[skin.championName];
    return { ...loadout, skins };
  }
  const target = championKey(skin.championName, champions);
  for (const name of Object.keys(skins))
    if (championKey(name, champions) === target) delete skins[name];
  skins[skin.championName] = skin.name;
  const customs = loadout.customs.filter((name) => {
    const mod = mods.find((m) => m.name === name);
    return (
      !mod ||
      modKind(mod) !== "skin" ||
      !customTargets(mod, champions, assignments).includes(target)
    );
  });
  return { skins, customs };
}
export function chooseCustom(
  loadout: Loadout,
  mod: CustomMod,
  enabled: boolean,
  mods: CustomMod[],
  champions: Champion[],
  assignments: ChampionAssignments
): Loadout {
  if (!enabled) return { ...loadout, customs: loadout.customs.filter((n) => n !== mod.name) };
  const targets = customTargets(mod, champions, assignments);
  if (targets.length === 0 && ["skin", "voice"].includes(modKind(mod)))
    throw new Error("Choose a champion for this custom mod before enabling it.");
  const skins =
    modKind(mod) === "skin"
      ? Object.fromEntries(
          Object.entries(loadout.skins).filter(
            ([name]) => !targets.includes(championKey(name, champions))
          )
        )
      : { ...loadout.skins };
  const customs = loadout.customs.filter((name) => {
    if (name === mod.name) return false;
    const other = mods.find((m) => m.name === name);
    return (
      !other || !modsConflict(mod, targets, other, customTargets(other, champions, assignments))
    );
  });
  return { skins, customs: [...customs, mod.name] };
}
export function resolveSelectionPaths(
  selection: Record<string, string>,
  downloads: DownloadedSkin[],
  customPaths: string[]
): string[] {
  return [
    ...new Set([
      ...Object.entries(selection).flatMap(([champion, name]) => {
        const skin = downloads.find((d) => d.champion_name === champion && d.skin_name === name);
        return skin ? [skin.zip_path] : [];
      }),
      ...customPaths,
    ]),
  ];
}
export function loadoutPaths(
  loadout: Loadout,
  downloads: DownloadedSkin[],
  mods: CustomMod[]
): string[] {
  return resolveSelectionPaths(
    loadout.skins,
    downloads,
    mods.filter((m) => loadout.customs.includes(m.name)).map((m) => m.file_path)
  );
}
