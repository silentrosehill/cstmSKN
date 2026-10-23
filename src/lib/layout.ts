export const SIDEBAR_MIN = 68;
export const SIDEBAR_MAX = 340;
export const SIDEBAR_DEFAULT = 224;
export function sidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT;
  const width = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, value));
  return width < 136 ? SIDEBAR_MIN : Math.round(width);
}
