import type { Champion, CustomMod, DownloadedSkin, Skin } from "../types/index.ts";
import { chooseCustom, chooseSkin, type ChampionAssignments, type Loadout } from "./selection.ts";

export interface Favorites {
  skins: Skin[];
  customs: string[];
}
export interface SavedLoadout {
  id: string;
  name: string;
  savedAt: string;
  selection: Loadout;
}
export function sanitizeLoadout(value: unknown): Loadout {
  const data = value && typeof value === "object" ? (value as Partial<Loadout>) : {};
  return {
    skins: Object.fromEntries(
      Object.entries(
        data.skins && typeof data.skins === "object" && !Array.isArray(data.skins) ? data.skins : {}
      ).filter(([name, skin]) => name && typeof skin === "string" && skin)
    ),
    customs: Array.isArray(data.customs)
      ? [
          ...new Set(
            data.customs.filter((name): name is string => typeof name === "string" && !!name)
          ),
        ]
      : [],
  };
}
export function sanitizeFavorites(value: unknown): Favorites {
  const data = value && typeof value === "object" ? (value as Partial<Favorites>) : {};
  const skins = Array.isArray(data.skins)
    ? data.skins.filter(
        (skin): skin is Skin =>
          !!skin &&
          [skin.id, skin.name, skin.championId, skin.championName].every(
            (value) => typeof value === "string" && !!value
          ) &&
          Number.isInteger(skin.num)
      )
    : [];
  return {
    skins: [...new Map(skins.map((skin) => [skin.id, skin])).values()],
    customs: sanitizeLoadout({ customs: data.customs }).customs,
  };
}
export function restoreLoadout(
  saved: Loadout,
  downloads: DownloadedSkin[],
  mods: CustomMod[],
  champions: Champion[],
  assignments: ChampionAssignments
): { selection: Loadout; missing: string[] } {
  let selection: Loadout = { skins: {}, customs: [] };
  const missing: string[] = [];
  for (const [championName, name] of Object.entries(sanitizeLoadout(saved).skins)) {
    if (downloads.some((d) => d.champion_name === championName && d.skin_name === name))
      selection = chooseSkin(selection, { championName, name }, true, mods, champions, assignments);
    else missing.push(name);
  }
  for (const name of sanitizeLoadout(saved).customs) {
    const mod = mods.find((mod) => mod.name === name);
    if (!mod) {
      missing.push(name);
      continue;
    }
    try {
      selection = chooseCustom(selection, mod, true, mods, champions, assignments);
    } catch {
      missing.push(name);
    }
  }
  return { selection, missing };
}

export class ChampionNavigationGate {
  private handled: number | null = null;
  accept(
    state: { state: string; championId: number | null; locked: boolean },
    blocked: boolean
  ): number | null {
    if (state.state === "connected" || state.state === "offline") {
      this.handled = null;
      return null;
    }
    if (
      state.state !== "selecting" ||
      !state.locked ||
      !state.championId ||
      blocked ||
      state.championId === this.handled
    )
      return null;
    this.handled = state.championId;
    return state.championId;
  }
}
