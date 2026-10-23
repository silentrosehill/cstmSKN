import type { CustomMod, ModKind } from "../types/index.ts";

export const MOD_CATEGORIES: { id: ModKind; label: string; singular: string }[] = [
  { id: "announcer", label: "Announcers", singular: "Announcer" },
  { id: "voice", label: "Champion voices", singular: "Champion voice" },
  { id: "map", label: "Maps", singular: "Map" },
  { id: "other", label: "Other", singular: "Other" },
];
export const modKind = (mod: Pick<CustomMod, "kind">): ModKind => mod.kind ?? "skin";
export const modLabel = (mod: Pick<CustomMod, "kind">): string =>
  MOD_CATEGORIES.find((c) => c.id === modKind(mod))?.singular ?? "Custom skin";
export const supportedModPath = (path: string): boolean =>
  /\.(fantome|zip|wad(?:\.client)?)$/i.test(path);
export const modFileName = (path: string): string =>
  (path.split(/[\\/]/).pop() ?? path).replace(/\.(fantome|zip|wad(?:\.client)?)$/i, "");

// Visual skins and voice packs occupy different slots for the same champion.
// Announcers and maps each have one global slot. Other mods coexist; the
// overlay builder still rejects real file conflicts instead of ignoring them.
export function modsConflict(
  a: CustomMod,
  aTargets: string[],
  b: CustomMod,
  bTargets: string[]
): boolean {
  const kind = modKind(a);
  if (kind !== modKind(b)) return false;
  if (kind === "announcer" || kind === "map") return true;
  return (kind === "skin" || kind === "voice") && aTargets.some((t) => bTargets.includes(t));
}
