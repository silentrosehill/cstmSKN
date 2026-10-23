import { getItem, setItem, readStored, stringRecord } from "./lib/storage";
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauri } from "@tauri-apps/api/core";
import {
  Swords,
  Layers,
  Package,
  Settings as SettingsIcon,
  Moon,
  Sun,
  ChevronRight,
  CircleCheck,
  Maximize2,
  PanelLeft,
  Sparkles,
  X,
  Image as ImageIcon,
  Star,
  SlidersHorizontal,
  Upload,
  History,
} from "lucide-react";
import { useGamePath } from "./hooks/useGamePath";
import { usePatcher } from "./hooks/usePatcher";
import { useDownloads } from "./hooks/useDownloads";
import { useCustoms } from "./hooks/useCustoms";
import { useChampions, championAvatar, ensureChampions } from "./hooks/useChampions";
import {
  ensureSkinIds,
  ensureRepoZips,
  ensureChromaInfo,
  getSkinsForChampion,
  skinDownloadUrl,
} from "./hooks/useSkinData";
import StatusBar from "./components/StatusBar";
import DownloadBar from "./components/DownloadBar";
import GamePathSelector from "./components/GamePathSelector";
import ChampionGrid from "./components/ChampionGrid";
const ChampionDetail = lazy(() => import("./components/ChampionDetail"));
const Changelog = lazy(() => import("./components/Changelog"));
import NewReleases from "./components/NewReleases";
const MySkins = lazy(() => import("./components/MySkins"));
import Customs from "./components/Customs";
const Favorites = lazy(() => import("./components/Favorites"));
const Loadouts = lazy(() => import("./components/Loadouts"));
import ImportReview from "./components/ImportReview";
import { useFavorites, useSavedLoadouts } from "./hooks/useCollections";
import { restoreLoadout, sanitizeLoadout, type SavedLoadout } from "./lib/collections";
import { modKind, modLabel, supportedModPath } from "./lib/mods";
import { useChampSelect } from "./hooks/useChampSelect";
import { usePatcherHealth } from "./hooks/usePatcherHealth";
import { sanitizeNavigation, moveTab, toggleTab } from "./lib/navigation";
import type { TabId, NavigationPreferences } from "./lib/navigation";
import { tabAccent } from "./lib/tabAccent";
const Settings = lazy(() => import("./components/Settings"));
import AppUpdateDialog from "./components/AppUpdateDialog";
import { useAppUpdates } from "./hooks/useAppUpdates";
const EnabledSkins = lazy(() => import("./components/EnabledSkins"));
import Toast from "./components/Toast";
import {
  chooseSkin,
  chooseCustom,
  customTargets,
  loadoutPaths,
  type Loadout,
  type ChampionAssignments,
} from "./lib/selection";
import type { Champion, CustomMod, Skin, ModKind } from "./types";
import brandIcon from "./assets/icon.png";
import SystemIcon from "./components/SystemIcon";
import { useSidebar } from "./hooks/useSidebar";
import { useNativeSidebarGlass } from "./hooks/useNativeSidebarGlass";
import { useArtworkTheme } from "./hooks/useArtworkTheme";
import type { CSSProperties } from "react";

type View = TabId;
const NAV_ITEMS: { id: View; label: string; icon: typeof Swords; symbol: string }[] = [
  { id: "whats-new", label: "New Releases", icon: Sparkles, symbol: "new" },
  { id: "champions", label: "Champions", icon: Swords, symbol: "grid" },
  { id: "my-skins", label: "Library", icon: Layers, symbol: "library" },
  { id: "favorites", label: "Favorites", icon: Star, symbol: "star" },
  { id: "loadouts", label: "Loadouts", icon: SlidersHorizontal, symbol: "loadouts" },
  { id: "game-mods", label: "Game Mods", icon: SlidersHorizontal, symbol: "mods" },
  { id: "customs", label: "Custom skins", icon: Package, symbol: "custom" },
  { id: "enabled", label: "Enabled", icon: CircleCheck, symbol: "enabled" },
  { id: "changelog", label: "Changelog", icon: History, symbol: "history" },
  { id: "settings", label: "Settings", icon: SettingsIcon, symbol: "settings" },
];

export default function App() {
  const { gamePath, detectedPath, status, selectPath, confirmSetup, checkPath } = useGamePath();
  const patcher = usePatcher();
  const patcherRef = useRef(patcher);
  patcherRef.current = patcher;
  const dl = useDownloads();
  const customs = useCustoms();
  const { champions } = useChampions();
  const native = isTauri();
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const [reviewNames, setReviewNames] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [gameImportKind, setGameImportKind] = useState<ModKind>("other");
  const [followClient, setFollowClient] = useState(
    () => readStored("cstm:follow-client", true) === true
  );
  const [navigation, setNavigation] = useState<NavigationPreferences>(() =>
    sanitizeNavigation(readStored("cstm:navigation", {}))
  );
  const visibleNav = navigation.order.flatMap((id) => {
    const item = NAV_ITEMS.find((item) => item.id === id);
    return item && !navigation.hidden.includes(id) ? [item] : [];
  });
  useEffect(() => {
    setItem("cstm:navigation", JSON.stringify(navigation));
  }, [navigation]);
  const favorites = useFavorites();
  const savedLoadouts = useSavedLoadouts();
  const updateBlockedReason = patcher.isActive
    ? "Stop the patcher before updating."
    : dl.downloading
      ? "Finish the skin download before updating."
      : importing || reviewNames.length > 0
        ? "Finish reviewing imported mods before updating."
        : null;
  const updates = useAppUpdates(updateBlockedReason);
  const sidebar = useSidebar();
  const sidebarElement = useRef<HTMLElement>(null);
  useNativeSidebarGlass(sidebarElement, native);
  const [artwork, setArtwork] = useState<string | null>(null);
  const [theme, setTheme] = useState(() => getItem("glass:theme") ?? "dark");
  const [accent, setAccent] = useState(() => getItem("glass:accent") ?? "lavender");
  const [accentMode, setAccentMode] = useState(() => getItem("glass:accent-mode") ?? "tab");
  useArtworkTheme(artwork, theme);
  const [view, setView] = useState<View>(() =>
    navigation.hidden.includes("champions")
      ? (navigation.order.find((id) => !navigation.hidden.includes(id)) ?? "settings")
      : "champions"
  );
  const effectiveAccent = tabAccent(view, accent, accentMode);
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null);
  const [selectedSkinId, setSelectedSkinId] = useState<string | null>(null);
  const [previewSkin, setPreviewSkin] = useState<Skin | null>(null);
  const [galleryOrigin, setGalleryOrigin] = useState<"champions" | "whats-new" | "favorites">(
    "champions"
  );
  const [catalogSearch, setCatalogSearch] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<ChampionAssignments>(() =>
    stringRecord(readStored("cstm:mod-champions", {}))
  );
  const [loadout, setLoadout] = useState<Loadout>(() =>
    sanitizeLoadout(
      readStored("cstm:loadout", {
        skins: readStored("zushi_skin_selection", {}),
        customs: readStored("zushi_customs_enabled", []),
      })
    )
  );
  const loadoutRef = useRef(loadout);
  const modsRef = useRef(customs.customs);
  modsRef.current = customs.customs;
  const downloadsRef = useRef(dl.downloads);
  downloadsRef.current = dl.downloads;
  const assignmentsRef = useRef(assignments);
  assignmentsRef.current = assignments;
  const customMods = customs.customs.map((c) => ({
    ...c,
    enabled: loadout.customs.includes(c.name),
  }));
  const selectedDownloads = dl.downloads.filter(
    (d) => loadout.skins[d.champion_name] === d.skin_name
  );
  const enabledMods = customMods.filter((c) => c.enabled);
  const selectionCount = selectedDownloads.length + enabledMods.length;
  const sidebarDownloads = selectedDownloads.slice(0, 4);
  const sidebarMods = enabledMods.slice(0, Math.max(0, 4 - sidebarDownloads.length));
  const sidebarRemaining = selectionCount - sidebarDownloads.length - sidebarMods.length;
  const activePaths = loadoutPaths(loadout, dl.downloads, customs.customs);
  const health = usePatcherHealth(activePaths, gamePath, patcher.status);
  const clientStatus = useChampSelect(
    followClient,
    updates.blocking ||
      importing ||
      reviewNames.length > 0 ||
      !champions.length ||
      navigation.hidden.includes("champions"),
    (id) => {
      const champion = champions.find((c) => c.key === String(id));
      if (champion) openChampion(champion);
    }
  );
  const reviewedMod = customMods.find((mod) => mod.name === reviewNames[0]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    setItem("glass:theme", theme);
    if (native)
      void getCurrentWebviewWindow()
        .setTheme(theme === "light" ? "light" : "dark")
        .catch(() => {});
  }, [theme, native]);
  useEffect(() => {
    document.documentElement.dataset.accent = effectiveAccent;
  }, [effectiveAccent]);
  useEffect(() => {
    setItem("glass:accent", accent);
  }, [accent]);
  useEffect(() => {
    setItem("glass:accent-mode", accentMode);
  }, [accentMode]);
  useEffect(() => {
    if (native)
      getCurrentWebviewWindow()
        .show()
        .catch(() => {});
  }, [native]);
  useEffect(() => {
    ensureSkinIds().catch(() => {});
    ensureRepoZips().catch(() => {});
    ensureChromaInfo().catch(() => {});
  }, []);
  useEffect(() => {
    if (patcher.error) setToastMessage(patcher.error);
  }, [patcher.error]);
  useEffect(() => {
    if (customs.error) setToastMessage(customs.error);
  }, [customs.error]);

  // Every selection update uses the newest loadout, including consecutive imports.
  const commitLoadout = useCallback((next: Loadout, mods = modsRef.current) => {
    loadoutRef.current = next;
    setLoadout(next);
    setItem("cstm:loadout", JSON.stringify(next));
    if (patcherRef.current.isActive) {
      const paths = loadoutPaths(next, downloadsRef.current, mods);
      if (paths.length) void patcherRef.current.apply(paths);
      else void patcherRef.current.stop();
    }
  }, []);
  function selectLook(skin: Skin, enabled: boolean) {
    commitLoadout(
      chooseSkin(
        loadoutRef.current,
        skin,
        enabled,
        modsRef.current,
        champions,
        assignmentsRef.current
      )
    );
  }
  function toggleCustom(mod: CustomMod) {
    try {
      commitLoadout(
        chooseCustom(
          loadoutRef.current,
          mod,
          !loadoutRef.current.customs.includes(mod.name),
          modsRef.current,
          champions,
          assignmentsRef.current
        )
      );
    } catch (e) {
      setToastMessage(String(e));
    }
  }
  async function downloadLook(url: string, name: string, skin: string): Promise<boolean> {
    const path = await dl.download(url, name, skin);
    if (path)
      downloadsRef.current = [
        ...downloadsRef.current.filter((d) => !(d.champion_name === name && d.skin_name === skin)),
        { champion_name: name, skin_name: skin, zip_path: path },
      ];
    return !!path;
  }
  async function selectFavorite(skin: Skin, enabled: boolean) {
    if (enabled && !dl.isDownloaded(skin.championName, skin.name)) {
      await ensureRepoZips();
      const url = skinDownloadUrl(skin);
      if (!url) throw new Error("This skin is currently unavailable for download.");
      if (!(await downloadLook(url, skin.championName, skin.name))) return;
    }
    selectLook(skin, enabled);
  }
  async function addCustom(path: string, kind?: ModKind) {
    if (importingRef.current || updates.blocking)
      throw new Error("Finish the current operation before importing another mod.");
    importingRef.current = true;
    setImporting(true);
    try {
      await ensureChampions().catch(() => champions);
      const mod = await customs.addCustom(path, kind);
      modsRef.current = [...modsRef.current.filter((c) => c.name !== mod.name), mod];
      setReviewNames((queue) => [...queue, mod.name]);
      handleNav(modKind(mod) === "skin" ? "customs" : "game-mods");
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  }
  async function changeKind(name: string, kind: ModKind) {
    await customs.setKind(name, kind);
    modsRef.current = modsRef.current.map((mod) => (mod.name === name ? { ...mod, kind } : mod));
    if (loadoutRef.current.customs.includes(name))
      commitLoadout({
        ...loadoutRef.current,
        customs: loadoutRef.current.customs.filter((n) => n !== name),
      });
  }
  function useSavedLoadout(item: SavedLoadout) {
    const restored = restoreLoadout(
      item.selection,
      downloadsRef.current,
      modsRef.current,
      champions,
      assignmentsRef.current
    );
    commitLoadout(restored.selection);
    if (restored.missing.length)
      setToastMessage(
        `${restored.missing.length} unavailable items skipped: ${restored.missing.join(", ")}`
      );
  }
  function assignCustom(name: string, champion: string) {
    const nextAssignments = { ...assignmentsRef.current, [name]: champion };
    assignmentsRef.current = nextAssignments;
    setAssignments(nextAssignments);
    setItem("cstm:mod-champions", JSON.stringify(nextAssignments));
    const mod = modsRef.current.find((c) => c.name === name);
    if (mod && loadoutRef.current.customs.includes(name)) {
      const disabled = chooseCustom(
        loadoutRef.current,
        mod,
        false,
        modsRef.current,
        champions,
        nextAssignments
      );
      commitLoadout(
        champion
          ? chooseCustom(disabled, mod, true, modsRef.current, champions, nextAssignments)
          : disabled
      );
    }
  }
  async function removeCustom(name: string) {
    commitLoadout({
      ...loadoutRef.current,
      customs: loadoutRef.current.customs.filter((n) => n !== name),
    });
    try {
      await customs.remove(name);
    } catch (e) {
      setToastMessage(String(e));
    }
  }
  function handleNav(id: View) {
    setArtwork(null);
    setView(id);
    setSelectedChampion(null);
    setSelectedSkinId(null);
    setPreviewSkin(null);
  }
  function openChampion(
    champion: Champion,
    skinId?: string,
    skin?: Skin,
    origin: "champions" | "whats-new" | "favorites" = "champions"
  ) {
    setGalleryOrigin(origin);
    setView("champions");
    setSelectedSkinId(skinId ?? null);
    setPreviewSkin(skin ?? null);
    setSelectedChampion(champion);
  }
  function applySelection() {
    const paths = loadoutPaths(loadoutRef.current, downloadsRef.current, modsRef.current);
    if (paths.length) void patcher.apply(paths);
  }

  async function favoriteDownloaded(championName: string, name: string) {
    try {
      const roster = await ensureChampions();
      const champion = roster.find((c) => c.id === championName || c.name === championName);
      if (!champion)
        throw new Error("Champion details are unavailable. Try again when the catalog loads.");
      const skin = getSkinsForChampion(champion, await ensureSkinIds()).find(
        (s) => s.name === name
      );
      if (!skin)
        throw new Error(
          "Skin details are unavailable. Open it in Champions to add it to favorites."
        );
      favorites.toggleSkin(skin);
    } catch (e) {
      setToastMessage(String(e));
    }
  }

  function disableSkin(champion: string) {
    commitLoadout({
      ...loadoutRef.current,
      skins: Object.fromEntries(
        Object.entries(loadoutRef.current.skins).filter(([name]) => name !== champion)
      ),
    });
  }

  function content() {
    if (view === "favorites")
      return (
        <Favorites
          selection={loadout.skins}
          onSelectSkin={selectFavorite}
          onSelectCustom={toggleCustom}
          downloading={dl.downloading}
          favorites={favorites.favorites}
          customs={customMods}
          onOpen={(skin) => {
            const champion = champions.find((c) => c.id === skin.championId);
            if (champion) openChampion(champion, skin.id, skin, "favorites");
          }}
          onRemove={favorites.toggleSkin}
          onRemoveCustom={favorites.toggleCustom}
          onOpenCustom={(mod) => handleNav(modKind(mod) === "skin" ? "customs" : "game-mods")}
          isDownloaded={dl.isDownloaded}
        />
      );
    if (view === "loadouts")
      return (
        <Loadouts
          saved={savedLoadouts.saved}
          onChange={savedLoadouts.update}
          current={loadout}
          downloads={dl.downloads}
          customs={customMods}
          champions={champions}
          assignments={assignments}
          onUse={useSavedLoadout}
        />
      );
    if (view === "whats-new")
      return (
        <NewReleases
          onSelect={(champion, skin) => openChampion(champion, skin.id, skin, "whats-new")}
          isDownloaded={dl.isDownloaded}
        />
      );
    if (view === "enabled")
      return (
        <EnabledSkins
          downloads={selectedDownloads}
          customs={enabledMods}
          champions={champions}
          assignments={assignments}
          onDisableSkin={disableSkin}
          onDisableCustom={(name) => {
            const mod = modsRef.current.find((c) => c.name === name);
            if (mod) toggleCustom(mod);
          }}
          onClear={() => commitLoadout({ skins: {}, customs: [] })}
          onOpenChampion={(champion) => openChampion(champion)}
          onOpenCustoms={(mod) => handleNav(modKind(mod) === "skin" ? "customs" : "game-mods")}
        />
      );
    if (view === "changelog") return <Changelog />;
    if (view === "settings")
      return (
        <div className="flex-1 overflow-y-auto">
          <Settings
            sidebarItems={NAV_ITEMS}
            navigation={navigation}
            onMoveTab={(id, index) => setNavigation((value) => moveTab(value, id, index))}
            onToggleTab={(id) => setNavigation((value) => toggleTab(value, id))}
            onResetTabs={() => setNavigation(sanitizeNavigation({}))}
            accentMode={accentMode}
            onAccentModeChange={setAccentMode}
            hasSelection={selectionCount > 0}
            health={health}
            onRetry={applySelection}
            followClient={followClient}
            clientStatus={clientStatus}
            onFollowClientChange={(enabled) => {
              setFollowClient(enabled);
              setItem("cstm:follow-client", JSON.stringify(enabled));
            }}
            updates={updates}
            native={native}
            updateBlockedReason={updateBlockedReason}
            theme={theme}
            onThemeChange={setTheme}
            accent={accent}
            onAccentChange={setAccent}
            gamePath={gamePath}
            onPathChange={selectPath}
            patcherActive={patcher.isActive}
            onSkinsCleared={async () => {
              commitLoadout({ ...loadoutRef.current, skins: {} });
              await dl.refresh();
            }}
            onCustomsCleared={async () => {
              commitLoadout({ ...loadoutRef.current, customs: [] });
              await customs.refresh();
            }}
          />
        </div>
      );
    if (view === "customs" || view === "game-mods")
      return (
        <Customs
          importKind={gameImportKind}
          onImportKindChange={setGameImportKind}
          gameMods={view === "game-mods"}
          importing={importing}
          onKind={changeKind}
          favorites={favorites.favorites.customs}
          onFavorite={favorites.toggleCustom}
          customs={customMods.filter((mod) => (modKind(mod) === "skin") === (view === "customs"))}
          onAdd={addCustom}
          onRemove={removeCustom}
          onToggle={(name) => {
            const mod = modsRef.current.find((c) => c.name === name);
            if (mod) toggleCustom(mod);
          }}
          champions={champions}
          assignments={assignments}
          onAssign={assignCustom}
        />
      );
    if (view === "my-skins")
      return (
        <MySkins
          isFavorite={(champion, skin) =>
            favorites.favorites.skins.some((s) => s.championName === champion && s.name === skin)
          }
          onFavorite={(champion, skin) => void favoriteDownloaded(champion, skin)}
          downloads={dl.downloads}
          patcherActive={false}
          selection={loadout.skins}
          onSelectionChange={(nextSkins) => {
            let next = { ...loadoutRef.current, skins: nextSkins };
            for (const [name, skin] of Object.entries(nextSkins))
              if (loadoutRef.current.skins[name] !== skin)
                next = chooseSkin(
                  next,
                  { championName: name, name: skin },
                  true,
                  modsRef.current,
                  champions,
                  assignmentsRef.current
                );
            commitLoadout(next);
          }}
          onDelete={dl.deleteSkin}
        />
      );
    if (selectedChampion)
      return (
        <ChampionDetail
          key={`${selectedChampion.id}-${selectedSkinId ?? "saved"}`}
          champion={selectedChampion}
          initialSkinId={selectedSkinId}
          initialSkin={previewSkin}
          backLabel={
            galleryOrigin === "whats-new"
              ? "New Releases"
              : galleryOrigin === "favorites"
                ? "Favorites"
                : "Champions"
          }
          isFavorite={(skin) => favorites.favorites.skins.some((s) => s.id === skin.id)}
          onFavorite={favorites.toggleSkin}
          onBack={() => {
            setView(galleryOrigin);
            setArtwork(null);
            setSelectedChampion(null);
            setSelectedSkinId(null);
            setPreviewSkin(null);
          }}
          isDownloaded={dl.isDownloaded}
          downloading={dl.downloading}
          onDownload={downloadLook}
          selection={loadout.skins}
          onSelectSkin={selectLook}
          onArtworkChange={setArtwork}
        />
      );
    return (
      <ChampionGrid
        onSelect={openChampion}
        search={catalogSearch}
        onSearchChange={setCatalogSearch}
      />
    );
  }

  const dropHandler = useRef<(paths: string[]) => void>(() => {});
  dropHandler.current = (paths) => {
    if (updates.blocking || importingRef.current) return;
    const files = paths.filter(supportedModPath);
    if (!files.length) {
      setToastMessage("Choose a .fantome, .zip, .wad or .wad.client mod.");
      return;
    }
    const kind = view === "game-mods" ? gameImportKind : undefined;
    void (async () => {
      for (const path of files) {
        try {
          await addCustom(path, kind);
        } catch (e) {
          setToastMessage(String(e));
        }
      }
    })();
  };
  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let lastDrop = "";
    let lastTime = 0;
    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          setDragging(false);
          const key = JSON.stringify(event.payload.paths);
          const now = Date.now();
          if (key === lastDrop && now - lastTime < 1000) return;
          lastDrop = key;
          lastTime = now;
          dropHandler.current(event.payload.paths);
        } else setDragging(event.payload.type !== "leave");
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [native]);

  return (
    <div
      className={`glass-app ${native ? "native" : ""} ${sidebar.collapsed ? "sidebar-collapsed" : ""} ${sidebar.resizing ? "sidebar-resizing" : ""}`}
      style={{ "--sidebar-width": `${sidebar.width}px` } as CSSProperties}
    >
      <aside className="glass-sidebar" ref={sidebarElement} inert={updates.blocking}>
        <div className="brand">
          <img className="brand-app-icon" src={brandIcon} alt="cstmSKN icon" />
          <div className="brand-wordmark">
            <strong className="cstm-wordmark">
              cstm<span>SKN</span>
            </strong>
          </div>
          <button
            className="sidebar-toggle"
            onClick={sidebar.toggle}
            aria-label={sidebar.collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebar.collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <SystemIcon name="sidebar" fallback={PanelLeft} size={18} />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {visibleNav.map(({ id, label, icon: Icon, symbol }) => (
            <button
              key={id}
              title={label}
              aria-label={label}
              aria-current={view === id ? "page" : undefined}
              onClick={() => handleNav(id)}
              data-view={id}
              className={`nav-item ${view === id ? "active" : ""}`}
            >
              <span className="nav-symbol">
                <SystemIcon name={symbol} fallback={Icon} size={19} />
              </span>
              <span className="nav-label">{label}</span>
              {id === "my-skins" && dl.downloads.length > 0 && <em>{dl.downloads.length}</em>}
              {id === "customs" && customMods.some((m) => modKind(m) === "skin") && (
                <em>{customMods.filter((m) => modKind(m) === "skin").length}</em>
              )}
              {id === "game-mods" && customMods.some((m) => modKind(m) !== "skin") && (
                <em>{customMods.filter((m) => modKind(m) !== "skin").length}</em>
              )}
              {id === "enabled" && selectionCount > 0 && <em>{selectionCount}</em>}
            </button>
          ))}
        </nav>
        {!navigation.hidden.includes("enabled") && (
          <section className="enabled-section" aria-label="Enabled skins">
            <button
              className="enabled-heading"
              onClick={() => handleNav("enabled")}
              aria-label="Expand enabled skins"
              title="Open enabled skins"
            >
              <SystemIcon
                name="enabled"
                fallback={CircleCheck}
                size={18}
                className="enabled-heading-icon"
              />
              <span className="enabled-title">Enabled</span>
              <em>{selectionCount}</em>
              <SystemIcon
                name="expand"
                fallback={Maximize2}
                size={12}
                className="enabled-expand-icon"
              />
            </button>
            {selectionCount === 0 ? (
              <p className="enabled-empty-label">None</p>
            ) : (
              <div className="enabled-list">
                {sidebarDownloads.map((d) => {
                  const champion = champions.find(
                    (c) => c.name === d.champion_name || c.id === d.champion_name
                  );
                  return (
                    <div className="enabled-item" key={d.zip_path}>
                      <button
                        className="enabled-open"
                        title={`${d.champion_name} · ${d.skin_name}`}
                        aria-label={`${d.champion_name} · ${d.skin_name}`}
                        onClick={() => {
                          if (champion) {
                            openChampion(champion);
                          }
                        }}
                      >
                        {champion ? (
                          <img src={championAvatar(champion.id)} alt="" />
                        ) : (
                          <div className="enabled-custom-icon">
                            <ImageIcon size={14} />
                          </div>
                        )}
                        <span>
                          <strong>{champion?.name ?? d.champion_name}</strong>
                          <small>{d.skin_name}</small>
                        </span>
                      </button>
                      <button
                        className="enabled-remove"
                        aria-label={`Disable ${d.skin_name}`}
                        onClick={() => disableSkin(d.champion_name)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
                {sidebarMods.map((mod) => (
                  <div className="enabled-item" key={mod.file_path}>
                    <button
                      className="enabled-open"
                      title={mod.name}
                      aria-label={mod.name}
                      onClick={() => handleNav(modKind(mod) === "skin" ? "customs" : "game-mods")}
                    >
                      <div className="enabled-custom-icon">
                        <Package size={15} />
                      </div>
                      <span>
                        <strong>
                          {customTargets(mod, champions, assignments)
                            .map(
                              (id) => champions.find((c) => c.id.toLowerCase() === id)?.name ?? id
                            )
                            .join(", ") || modLabel(mod)}
                        </strong>
                        <small>{mod.name}</small>
                      </span>
                    </button>
                    <button
                      className="enabled-remove"
                      aria-label={`Disable ${mod.name}`}
                      onClick={() => toggleCustom(mod)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {sidebarRemaining > 0 && (
              <button className="enabled-more" onClick={() => handleNav("enabled")}>
                <span>View all {selectionCount}</span>
                <ChevronRight size={13} />
              </button>
            )}
          </section>
        )}
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="profile-avatar">c</div>
            <strong>cstmSKN</strong>
            <button
              className="theme-button"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} appearance`}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <SystemIcon name="sun" fallback={Sun} size={18} />
              ) : (
                <SystemIcon name="moon" fallback={Moon} size={18} />
              )}
            </button>
          </div>
        </div>
        <div className="sidebar-resizer" {...sidebar.separator} />
      </aside>
      <div className="workspace" inert={updates.blocking}>
        {view !== "champions" && view !== "whats-new" && (
          <div className="view-heading">
            <h1>{NAV_ITEMS.find((n) => n.id === view)?.label}</h1>
          </div>
        )}
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="content-stage" key={`${view}-${selectedChampion?.id ?? "index"}`}>
            <Suspense
              fallback={
                <div className="text-ink-muted p-6 text-sm" role="status">
                  Loading…
                </div>
              }
            >
              {content()}
            </Suspense>
          </div>
        </main>
        <DownloadBar downloading={dl.downloading} />
        <StatusBar
          health={health}
          native={native}
          onHealth={() => handleNav("settings")}
          patcherStatus={patcher.status}
          patcherActive={patcher.isActive}
          skinCount={selectedDownloads.length}
          customCount={enabledMods.length}
          onApply={applySelection}
          onStop={patcher.stop}
        />
      </div>
      {dragging && !updates.blocking && (
        <div className="global-drop-overlay">
          <div>
            <Upload size={35} />
            <h2>Drop to import</h2>
            <p>Custom skins, voices, maps, and more.</p>
          </div>
        </div>
      )}
      {reviewedMod && !updates.blocking && (
        <ImportReview
          key={reviewedMod.name}
          mod={reviewedMod}
          champions={champions}
          assignments={assignments}
          remaining={reviewNames.length}
          onKind={changeKind}
          onAssign={assignCustom}
          onEnable={(mod) => {
            try {
              commitLoadout(
                chooseCustom(
                  loadoutRef.current,
                  mod,
                  true,
                  modsRef.current,
                  champions,
                  assignmentsRef.current
                )
              );
            } catch (e) {
              setToastMessage(String(e));
            }
          }}
          onClose={() => setReviewNames((names) => names.slice(1))}
        />
      )}
      {updates.blocking && <AppUpdateDialog updates={updates} />}
      {(toastMessage || dl.error) && (
        <Toast
          key={toastMessage ?? dl.error ?? ""}
          message={toastMessage ?? dl.error ?? ""}
          onClose={() => {
            setToastMessage(null);
            dl.clearError();
            customs.clearError();
          }}
        />
      )}
      {native && status !== "game-detected" && (
        <div className="bg-charcoal-400 absolute inset-0 z-50">
          <GamePathSelector
            onConfirm={confirmSetup}
            onSelect={selectPath}
            onCheck={checkPath}
            detectedPath={detectedPath}
            status={status}
          />
        </div>
      )}
    </div>
  );
}
