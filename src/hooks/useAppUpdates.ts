import { useRef, useSyncExternalStore } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { AppUpdateController, isUpdateBlocking } from "../lib/appUpdates";
export function useAppUpdates(blockedReason: string | null) {
  const blocked = useRef(blockedReason);
  blocked.current = blockedReason;
  const controller = useRef<AppUpdateController | null>(null);
  if (!controller.current)
    controller.current = new AppUpdateController({
      check: () => check({ timeout: 15000 }),
      relaunch,
      blockedReason: () => blocked.current,
    });
  const client = controller.current;
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  return {
    state,
    blocking: isUpdateBlocking(state.stage),
    check: () => client.check(),
    install: () => client.install(),
    restart: () => client.restart(),
  };
}
export type AppUpdates = ReturnType<typeof useAppUpdates>;
