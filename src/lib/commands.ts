import { invoke as nativeInvoke, isTauri } from "@tauri-apps/api/core";
async function invoke<T = void>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) return nativeInvoke<T>(command, args);
  if (["list_customs", "list_downloaded_skins"].includes(command)) return [] as T;
  if (command.startsWith("get_") && command.endsWith("_size")) return 0 as T;
  if (["detect_game_path", "get_game_path"].includes(command)) return null as T;
  throw new Error("Open the cstmSKN desktop app to use native skin and game features.");
}
import type { ReleaseInfo } from "./windowsUpdate";
import type {
  PatcherStatus,
  DownloadedSkin,
  CustomEntry,
  ModKind,
  HealthCheck,
  ChampSelectState,
} from "../types";

export async function detectGamePath(): Promise<string | null> {
  return invoke<string | null>("detect_game_path");
}

export async function validateGamePath(path: string): Promise<string | null> {
  return invoke<string | null>("validate_game_path", { path });
}

export async function setGamePath(path: string): Promise<void> {
  return invoke("set_game_path", { path });
}

export async function getGamePath(): Promise<string | null> {
  return invoke<string | null>("get_game_path");
}

export async function applySkin(zipPath: string): Promise<string> {
  return invoke<string>("apply_skin", { zipPath });
}

export async function applySkins(zipPaths: string[]): Promise<string> {
  return invoke<string>("apply_skins", { zipPaths });
}

export async function stopPatcher(): Promise<void> {
  return invoke("stop_patcher");
}

export async function getPatcherStatus(): Promise<PatcherStatus> {
  return invoke<PatcherStatus>("get_patcher_status");
}

export async function downloadSkin(
  url: string,
  championName: string,
  skinName: string
): Promise<string> {
  return invoke<string>("download_skin", { url, championName, skinName });
}

export async function downloadMultipleSkins(
  items: { url: string; championName: string; skinName: string }[]
): Promise<number> {
  return invoke<number>("download_multiple_skins", { items });
}

export async function listDownloadedSkins(): Promise<DownloadedSkin[]> {
  return invoke<DownloadedSkin[]>("list_downloaded_skins");
}

export async function deleteDownloadedSkin(championName: string, skinName: string): Promise<void> {
  return invoke("delete_downloaded_skin", { championName, skinName });
}

export async function getSkinsDirSize(): Promise<number> {
  return invoke<number>("get_skins_dir_size");
}

export async function clearAllSkins(): Promise<void> {
  return invoke("clear_all_skins");
}

export async function getWorkDirSize(): Promise<number> {
  return invoke<number>("get_work_dir_size");
}

export async function clearWorkDir(): Promise<void> {
  return invoke("clear_work_dir");
}

export async function importCustom(
  srcPath: string,
  name: string,
  kind?: ModKind
): Promise<CustomEntry> {
  return invoke("import_custom", { srcPath, name, kind });
}

export async function setCustomKind(name: string, kind: ModKind): Promise<void> {
  return invoke("set_custom_kind", { name, kind });
}
export async function getPatcherHealth(paths: string[]): Promise<HealthCheck[]> {
  return invoke("get_patcher_health", { paths });
}
export async function getChampSelect(): Promise<ChampSelectState> {
  return invoke("get_champ_select");
}

export async function listCustoms(): Promise<CustomEntry[]> {
  return invoke("list_customs");
}

export async function removeCustom(name: string): Promise<void> {
  return invoke("remove_custom", { name });
}

export async function clearAllCustoms(): Promise<void> {
  return invoke("clear_all_customs");
}

export async function getCustomsDirSize(): Promise<number> {
  return invoke("get_customs_dir_size");
}

export async function getPatcherLog(): Promise<string> {
  return invoke<string>("get_patcher_log");
}

export async function openUrl(url: string): Promise<void> {
  return invoke("open_url", { url });
}

export async function listReleases(): Promise<ReleaseInfo[]> {
  return invoke<ReleaseInfo[]>("list_releases");
}
