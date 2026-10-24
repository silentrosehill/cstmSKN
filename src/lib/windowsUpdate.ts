export interface ReleaseInfo {
  tag: string;
  url: string;
  notes: string;
  assets: string[];
}

export interface WindowsUpdate {
  version: string;
  url: string;
  notes: string;
}

/** "v1.0.2-windows-alpha.1" or "1.0.2" → [1, 0, 2]. */
export function versionParts(text: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

export function isNewer(candidate: number[], current: number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if (candidate[i] !== current[i]) return candidate[i] > current[i];
  }
  return false;
}

/** The newest release that ships a Windows build and is newer than this app, if any. */
export function newestWindowsRelease(
  releases: ReleaseInfo[],
  currentVersion: string
): WindowsUpdate | null {
  const current = versionParts(currentVersion);
  if (!current) return null;
  let best: { parts: number[]; release: ReleaseInfo } | null = null;
  for (const release of releases) {
    const parts = versionParts(release.tag);
    const windows = release.assets.some(
      (name) => /windows/i.test(name) && /\.(exe|zip)$/i.test(name)
    );
    if (!parts || !windows || !isNewer(parts, current)) continue;
    if (!best || isNewer(parts, best.parts)) best = { parts, release };
  }
  return best
    ? { version: best.parts.join("."), url: best.release.url, notes: best.release.notes }
    : null;
}

export type WindowsUpdateState =
  | { stage: "idle" | "checking" | "current" }
  | { stage: "available"; update: WindowsUpdate }
  | { stage: "error"; error: string };

/** One shared check, so the startup check and the Settings card agree. */
export class WindowsUpdateStore {
  private state: WindowsUpdateState = { stage: "idle" };
  private listeners = new Set<() => void>();
  private readonly fetchReleases: () => Promise<ReleaseInfo[]>;
  private readonly currentVersion: string;
  constructor(fetchReleases: () => Promise<ReleaseInfo[]>, currentVersion: string) {
    this.fetchReleases = fetchReleases;
    this.currentVersion = currentVersion;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;
  private set(state: WindowsUpdateState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  check = async (): Promise<WindowsUpdateState> => {
    if (this.state.stage === "checking") return this.state;
    this.set({ stage: "checking" });
    try {
      const update = newestWindowsRelease(await this.fetchReleases(), this.currentVersion);
      this.set(update ? { stage: "available", update } : { stage: "current" });
    } catch (e) {
      this.set({ stage: "error", error: String(e) });
    }
    return this.state;
  };
}
