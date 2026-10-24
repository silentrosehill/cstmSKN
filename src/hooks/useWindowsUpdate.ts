import { useSyncExternalStore } from "react";
import { listReleases } from "../lib/commands";
import { WindowsUpdateStore } from "../lib/windowsUpdate";
import { version } from "../../package.json";

export const isWindows = typeof navigator !== "undefined" && /Win/.test(navigator.platform);

const store = new WindowsUpdateStore(listReleases, version);

/** Windows preview updates: checks GitHub for a newer Windows build and links to its download page. */
export function useWindowsUpdate() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { state, check: store.check };
}
