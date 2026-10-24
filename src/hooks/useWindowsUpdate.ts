import { useSyncExternalStore } from "react";
import { listReleases } from "../lib/commands";
import { WindowsUpdateStore } from "../lib/windowsUpdate";
import { version, windowsBuild } from "../../package.json";

export const isWindows = typeof navigator !== "undefined" && /Win/.test(navigator.platform);

/** This Windows build, as named in its release tag (for example 1.0.1-windows-alpha.2). */
export const windowsVersion = `${version}-${windowsBuild}`;

const store = new WindowsUpdateStore(listReleases, windowsVersion);

/** Windows preview updates: checks GitHub for a newer Windows build and links to its download page. */
export function useWindowsUpdate() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { state, check: store.check };
}
