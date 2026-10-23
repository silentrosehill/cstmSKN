export const DEFAULT_TAB_ORDER = [
  "whats-new",
  "champions",
  "my-skins",
  "favorites",
  "loadouts",
  "game-mods",
  "customs",
  "enabled",
  "settings",
] as const;
export type TabId = (typeof DEFAULT_TAB_ORDER)[number];
export interface NavigationPreferences {
  order: TabId[];
  hidden: TabId[];
}
const isTab = (id: unknown): id is TabId =>
  typeof id === "string" && (DEFAULT_TAB_ORDER as readonly string[]).includes(id);
export function sanitizeNavigation(value: unknown): NavigationPreferences {
  const data = value && typeof value === "object" ? (value as Partial<NavigationPreferences>) : {};
  const order = Array.isArray(data.order) ? [...new Set(data.order.filter(isTab))] : [];
  const hidden = Array.isArray(data.hidden)
    ? [...new Set(data.hidden.filter(isTab))].filter((id) => id !== "settings")
    : [];
  return { order: [...order, ...DEFAULT_TAB_ORDER.filter((id) => !order.includes(id))], hidden };
}
export function moveTab(
  preferences: NavigationPreferences,
  id: TabId,
  index: number
): NavigationPreferences {
  const clean = sanitizeNavigation(preferences);
  const order = clean.order.filter((tab) => tab !== id);
  order.splice(Math.max(0, Math.min(order.length, Math.trunc(index) || 0)), 0, id);
  return { ...clean, order };
}
export function toggleTab(preferences: NavigationPreferences, id: TabId): NavigationPreferences {
  const clean = sanitizeNavigation(preferences);
  if (id === "settings") return clean;
  return {
    ...clean,
    hidden: clean.hidden.includes(id)
      ? clean.hidden.filter((tab) => tab !== id)
      : [...clean.hidden, id],
  };
}
