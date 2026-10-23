export const TAB_ACCENTS: Record<string, string> = {
  "whats-new": "release-gold",
  champions: "ocean",
  "my-skins": "library-indigo",
  favorites: "amber",
  loadouts: "loadout-violet",
  "game-mods": "mod-rose",
  customs: "custom-coral",
  enabled: "mint",
  changelog: "history-teal",
  settings: "graphite",
};
export function tabAccent(view: string, fixed: string, mode: string): string {
  return mode === "fixed" ? fixed : (TAB_ACCENTS[view] ?? fixed);
}
