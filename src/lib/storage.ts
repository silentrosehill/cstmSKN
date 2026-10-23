/** Storage may be disabled or full. Keep UI actions working in this session. */
export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function setItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Unavailable storage. */
  }
}
export function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === "string"))]
    : [];
}
export function stringRecord(value: unknown): Record<string, string> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "string"))
    : {};
}
