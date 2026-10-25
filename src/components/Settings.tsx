import { removeItem } from "../lib/storage";
import { useState, useEffect, useCallback } from "react";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import { Power, FolderOpen, Trash2, Loader2, HardDrive } from "lucide-react";
import {
  getPatcherLog,
  getSkinsDirSize,
  getWorkDirSize,
  getCustomsDirSize,
  clearAllSkins,
  clearWorkDir,
  clearAllCustoms,
} from "../lib/commands";
import Toast from "./Toast";
import LtkCompanionCard from "./LtkCompanionCard";
import AppUpdateCard from "./AppUpdateCard";
import SidebarSettings from "./SidebarSettings";
import type { SidebarItem } from "./SidebarSettings";
import type { NavigationPreferences, TabId } from "../lib/navigation";
import PatcherHealthCard from "./PatcherHealthCard";
import type { PatcherHealth } from "../hooks/usePatcherHealth";
import type { ChampSelectState } from "../types";
import type { AppUpdates } from "../hooks/useAppUpdates";

interface SettingsProps {
  sidebarItems: SidebarItem[];
  navigation: NavigationPreferences;
  onMoveTab: (id: TabId, index: number) => void;
  onToggleTab: (id: TabId) => void;
  onResetTabs: () => void;
  accentMode: string;
  onAccentModeChange: (mode: string) => void;
  hasSelection: boolean;
  health: PatcherHealth;
  onRetry: () => void;
  followClient: boolean;
  onFollowClientChange: (enabled: boolean) => void;
  clientStatus: ChampSelectState["state"];
  updates: AppUpdates;
  native: boolean;
  updateBlockedReason: string | null;
  theme: string;
  onThemeChange: (theme: string) => void;
  accent: string;
  onAccentChange: (accent: string) => void;
  gamePath: string | null;
  onPathChange: (path: string) => Promise<boolean>;
  patcherActive: boolean;
  onSkinsCleared: () => Promise<void>;
  onCustomsCleared: () => Promise<void>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function Settings({
  sidebarItems,
  navigation,
  onMoveTab,
  onToggleTab,
  onResetTabs,
  accentMode,
  onAccentModeChange,
  hasSelection,
  health,
  onRetry,
  followClient,
  onFollowClientChange,
  clientStatus,
  updates,
  native,
  updateBlockedReason,
  theme,
  onThemeChange,
  accent,
  onAccentChange,
  gamePath,
  onPathChange,
  patcherActive,
  onSkinsCleared,
  onCustomsCleared,
}: SettingsProps) {
  const [storageError, setStorageError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [autoStartLoading, setAutoStartLoading] = useState(true);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);

  // Cache state
  const [skinsSize, setSkinsSize] = useState(0);
  const [workSize, setWorkSize] = useState(0);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [customsSize, setCustomsSize] = useState(0);
  const [clearingContent, setClearingContent] = useState(false);
  const [clearingWork, setClearingWork] = useState(false);

  useEffect(() => {
    isEnabled()
      .then(setAutoStart)
      .catch(() => {})
      .finally(() => setAutoStartLoading(false));
  }, []);

  const refreshCache = useCallback(async () => {
    setCacheLoading(true);
    try {
      const [s, w, c] = await Promise.all([
        getSkinsDirSize(),
        getWorkDirSize(),
        getCustomsDirSize(),
      ]);
      setSkinsSize(s);
      setWorkSize(w);
      setCustomsSize(c);
    } catch {
      // ignore
    }
    setCacheLoading(false);
  }, []);

  useEffect(() => {
    refreshCache();
  }, [refreshCache]);

  const handleAutoStartToggle = async () => {
    setAutoStartLoading(true);
    try {
      if (autoStart) {
        await disable();
        setAutoStart(false);
      } else {
        await enable();
        setAutoStart(true);
      }
    } catch {
      // state stays unchanged
    } finally {
      setAutoStartLoading(false);
    }
  };

  const handleChangePath = async () => {
    setPathError(null);
    setPathLoading(true);
    try {
      const selected = await open({
        multiple: false,
        directory: /Win/.test(navigator.platform),
        title: "Select League of Legends app",
      });
      if (selected) {
        const valid = await onPathChange(selected as string);
        if (!valid) {
          setPathError("Select the League installation or its Game folder.");
        }
      }
    } catch {
      setPathError("Failed to open file dialog.");
    } finally {
      setPathLoading(false);
    }
  };

  const handleClearContent = async () => {
    setClearingContent(true);
    setStorageError(null);
    const results = await Promise.allSettled([
      clearAllSkins().then(async () => {
        removeItem("zushi_skin_selection");
        await onSkinsCleared();
      }),
      clearAllCustoms().then(async () => {
        removeItem("zushi_customs_enabled");
        await onCustomsCleared();
      }),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") setStorageError(String(failed.reason));
    setClearingContent(false);
    await refreshCache();
  };

  const handleClearWork = async () => {
    setClearingWork(true);
    setStorageError(null);
    try {
      await clearWorkDir();
    } catch (error) {
      setStorageError(String(error));
    }
    setClearingWork(false);
    await refreshCache();
  };

  const contentSize = skinsSize + customsSize;
  const totalSize = skinsSize + workSize + customsSize;

  return (
    <div className="h-full w-full overflow-y-auto p-5">
      {storageError && (
        <p role="alert" className="text-error mb-4 text-sm">
          {storageError}
        </p>
      )}
      <section className="appearance-settings" aria-label="Appearance">
        <h2>Appearance</h2>
        <div className="appearance-modes">
          {["dark", "light"].map((mode) => (
            <button
              key={mode}
              aria-pressed={theme === mode}
              className={theme === mode ? "chosen" : ""}
              onClick={() => onThemeChange(mode)}
            >
              <div className={`theme-preview ${mode}`}>
                <i />
                <span />
                <b />
              </div>
              <strong>{mode === "dark" ? "Midnight" : "Daylight"}</strong>
              <small>{theme === mode ? "Selected" : "Select appearance"}</small>
            </button>
          ))}
        </div>
        <div className="accent-heading">
          <strong>Accent color</strong>
          <div className="accent-mode-control" aria-label="Accent behavior">
            <button
              aria-pressed={accentMode !== "fixed"}
              className={accentMode !== "fixed" ? "chosen" : ""}
              onClick={() => onAccentModeChange("tab")}
            >
              Follow tabs
            </button>
            <button
              aria-pressed={accentMode === "fixed"}
              className={accentMode === "fixed" ? "chosen" : ""}
              onClick={() => onAccentModeChange("fixed")}
            >
              Fixed color
            </button>
          </div>
        </div>
        {accentMode === "fixed" && (
          <div className="accent-options">
            {[
              { id: "lavender", label: "Lavender", color: "#a3b4fa" },
              { id: "ocean", label: "Ocean", color: "#6bbbf1" },
              { id: "mint", label: "Mint", color: "#83d7b5" },
              { id: "rose", label: "Rose", color: "#eea8c9" },
              { id: "amber", label: "Amber", color: "#e6c183" },
              { id: "graphite", label: "Graphite", color: "#b6becb" },
            ].map((option) => (
              <button
                key={option.id}
                className={accent === option.id ? "chosen" : ""}
                aria-pressed={accent === option.id}
                onClick={() => onAccentChange(option.id)}
              >
                <i style={{ background: option.color }} />
                {option.label}
              </button>
            ))}
          </div>
        )}
      </section>
      <SidebarSettings
        items={sidebarItems}
        preferences={navigation}
        onMove={onMoveTab}
        onToggle={onToggleTab}
        onReset={onResetTabs}
      />
      {/Win/.test(navigator.platform) && (
        <LtkCompanionCard native={native} active={patcherActive} />
      )}
      <AppUpdateCard updates={updates} native={native} blockedReason={updateBlockedReason} />
      <section className="client-settings">
        <div>
          <h2>Follow champion select</h2>
          <p>Open your champion’s skins when you lock in.</p>
          <small>
            {!native
              ? "Available in the desktop app."
              : !followClient
                ? "Off"
                : clientStatus === "offline"
                  ? "League client is closed."
                  : clientStatus === "unavailable"
                    ? "Waiting for the League client connection…"
                    : clientStatus === "selecting"
                      ? "Connected · Champion select"
                      : "Connected to League"}
          </small>
        </div>
        <button
          className={`setting-switch ${followClient ? "on" : ""}`}
          disabled={!native}
          role="switch"
          aria-checked={followClient}
          aria-label="Follow champion select"
          onClick={() => onFollowClientChange(!followClient)}
        >
          <span />
        </button>
      </section>
      <PatcherHealthCard
        hasSelection={hasSelection}
        health={health}
        native={native}
        active={patcherActive}
        onRetry={onRetry}
      />
      {/* General */}
      <div className="pb-2">
        <span className="text-ink-muted text-[11px] font-medium tracking-wider uppercase select-none">
          General
        </span>
      </div>

      <div className="border-border divide-border divide-y rounded-lg border">
        {/* Auto-start */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Power size={16} strokeWidth={1.5} className="text-ink-muted" />
            <div className="flex flex-col gap-0.5">
              <span className="text-ink text-sm">Launch at login</span>
              <span className="text-ink-muted text-xs">Start cstmSKN when you log in</span>
            </div>
          </div>
          <button
            onClick={handleAutoStartToggle}
            disabled={autoStartLoading}
            aria-pressed={autoStart}
            aria-label="Launch at login"
            className={[
              "relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
              "focus:outline-none disabled:cursor-not-allowed disabled:opacity-40",
              autoStart ? "bg-gold-400" : "bg-charcoal-100",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform duration-200",
                autoStart ? "translate-x-4" : "translate-x-0",
              ].join(" ")}
            />
          </button>
        </div>

        {/* Game path */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <FolderOpen size={16} strokeWidth={1.5} className="text-ink-muted shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-ink text-sm">Game path</span>
              <span className="text-ink-muted truncate font-mono text-xs">
                {gamePath ?? "Not set"}
              </span>
            </div>
          </div>
          <button
            onClick={handleChangePath}
            disabled={pathLoading}
            className="border-border text-ink-secondary hover:border-gold-400 hover:text-gold-400 shrink-0 cursor-pointer rounded-md border px-3.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pathLoading ? "Validating..." : "Change"}
          </button>
        </div>
      </div>

      {/* Storage */}
      <div className="mt-6 pb-2">
        <span className="text-ink-muted text-[11px] font-medium tracking-wider uppercase select-none">
          Storage
        </span>
      </div>

      {/* Total usage */}
      <div className="border-border mb-3 flex items-center gap-3 rounded-lg border px-4 py-3.5">
        <HardDrive size={16} strokeWidth={1.5} className="text-ink-muted shrink-0" />
        <span className="text-ink flex-1 text-sm">Total usage</span>
        <span className="text-ink text-sm font-medium tabular-nums">
          {cacheLoading ? "..." : formatSize(totalSize)}
        </span>
      </div>

      <div className="border-border divide-border divide-y rounded-lg border">
        {/* Skins & custom mods */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-ink text-sm">Skins &amp; Custom Mods</span>
            <span className="text-ink-muted text-xs">Downloaded skins and imported mods</span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="text-ink-secondary min-w-16 text-right text-sm tabular-nums">
              {cacheLoading ? "..." : formatSize(contentSize)}
            </span>
            <button
              onClick={handleClearContent}
              disabled={clearingContent || contentSize === 0 || patcherActive}
              className="border-border text-ink-secondary hover:text-error hover:border-error/40 flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-30"
            >
              {clearingContent ? (
                <Loader2 size={13} strokeWidth={2} className="animate-spin" />
              ) : (
                <Trash2 size={13} strokeWidth={1.5} />
              )}
              Clear
            </button>
          </div>
        </div>

        {/* Patcher data */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-ink text-sm">Patcher Data</span>
            <span className="text-ink-muted text-xs">
              Temporary overlay files, rebuilt on apply
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="text-ink-secondary min-w-16 text-right text-sm tabular-nums">
              {cacheLoading ? "..." : formatSize(workSize)}
            </span>
            <button
              onClick={handleClearWork}
              disabled={clearingWork || workSize === 0 || patcherActive}
              className="border-border text-ink-secondary hover:text-error hover:border-error/40 flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-30"
            >
              {clearingWork ? (
                <Loader2 size={13} strokeWidth={2} className="animate-spin" />
              ) : (
                <Trash2 size={13} strokeWidth={1.5} />
              )}
              Clear
            </button>
          </div>
        </div>
      </div>

      {patcherActive && (
        <p className="text-ink-muted mt-2 px-1 text-xs">Stop the patcher before clearing data.</p>
      )}

      <details className="patcher-diagnostics">
        <summary>Diagnostics</summary>
        <div>
          <strong>Patcher diagnostics</strong>
          <button
            className="primary-button"
            onClick={async () => {
              try {
                setDiagnostics(await getPatcherLog());
              } catch (e) {
                setDiagnostics(String(e));
              }
            }}
          >
            {diagnostics === null ? "View log" : "Refresh log"}
          </button>
        </div>
        {diagnostics !== null && <pre>{diagnostics}</pre>}
      </details>
      <details className="about-app">
        <summary>About cstmSKN</summary>
        <p>Based on Zushi by Mouadzz and contributors. Artwork © Riot Games.</p>
        <p>Not affiliated with Riot Games.</p>
      </details>
      {pathError && <Toast message={pathError} onClose={() => setPathError(null)} />}
    </div>
  );
}
