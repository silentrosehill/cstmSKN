import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauri } from "@tauri-apps/api/core";
import { Swords, Layers, Package, Settings as SettingsIcon, Moon, Sun, ChevronRight, CircleCheck, Maximize2, PanelLeft, Sparkles, X, Image as ImageIcon } from "lucide-react";
import { useGamePath } from "./hooks/useGamePath";
import { usePatcher } from "./hooks/usePatcher";
import { useDownloads } from "./hooks/useDownloads";
import { useCustoms } from "./hooks/useCustoms";
import { useChampions, championAvatar, ensureChampions } from "./hooks/useChampions";
import { ensureSkinIds, ensureRepoZips, ensureChromaInfo } from "./hooks/useSkinData";
import StatusBar from "./components/StatusBar";
import DownloadBar from "./components/DownloadBar";
import GamePathSelector from "./components/GamePathSelector";
import ChampionGrid from "./components/ChampionGrid";
import ChampionDetail from "./components/ChampionDetail";
import NewReleases from "./components/NewReleases";
import MySkins from "./components/MySkins";
import Customs from "./components/Customs";
import Settings from "./components/Settings";
import EnabledSkins from "./components/EnabledSkins";
import Toast from "./components/Toast";
import { chooseSkin, chooseCustom, customTargets, loadoutPaths, type Loadout, type ChampionAssignments } from "./lib/selection";
import type { Champion, CustomMod, Skin } from "./types";
import brandIcon from "./assets/icon.png";
import SystemIcon from "./components/SystemIcon";
import { useSidebar } from "./hooks/useSidebar";
import { useNativeSidebarGlass } from "./hooks/useNativeSidebarGlass";
import { useArtworkTheme } from "./hooks/useArtworkTheme";
import type { CSSProperties } from "react";

type View = "whats-new" | "champions" | "my-skins" | "customs" | "enabled" | "settings";
const NAV_ITEMS: { id: View; label: string; icon: typeof Swords; symbol:string }[] = [
  { id: "whats-new", label: "New Releases", icon: Sparkles, symbol:"new" },
  { id: "champions", label: "Champions", icon: Swords, symbol:"grid" }, { id: "my-skins", label: "Library", icon: Layers, symbol:"library" },
  { id: "customs", label: "Custom skins", icon: Package, symbol:"custom" }, { id: "enabled", label: "Enabled skins", icon: CircleCheck, symbol:"enabled" }, { id: "settings", label: "Settings", icon: SettingsIcon, symbol:"settings" },
];
function stored<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; } }

export default function App() {
  const { gamePath, detectedPath, status, selectPath, confirmSetup, checkPath } = useGamePath();
  const patcher = usePatcher();
  const patcherRef = useRef(patcher); patcherRef.current = patcher;
  const dl = useDownloads();
  const customs = useCustoms();
  const { champions } = useChampions();
  const native = isTauri();
  const sidebar = useSidebar();
  const sidebarElement = useRef<HTMLElement>(null);
  useNativeSidebarGlass(sidebarElement, native);
  const [artwork,setArtwork] = useState<string|null>(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("glass:theme") ?? "dark");
  const [accent, setAccent] = useState(() => localStorage.getItem("glass:accent") ?? "lavender");
  useArtworkTheme(artwork,theme);
  const [view, setView] = useState<View>("champions");
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null);
  const [selectedSkinId, setSelectedSkinId] = useState<string | null>(null);
  const [previewSkin, setPreviewSkin] = useState<Skin | null>(null);
  const [galleryOrigin, setGalleryOrigin] = useState<"champions" | "whats-new">("champions");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<ChampionAssignments>(() => stored("cstm:mod-champions", {}));
  const [loadout, setLoadout] = useState<Loadout>(() => stored("cstm:loadout", { skins:stored("zushi_skin_selection",{}), customs:stored("zushi_customs_enabled",[]) }));
  const loadoutRef = useRef(loadout);
  const modsRef = useRef(customs.customs); modsRef.current = customs.customs;
  const downloadsRef = useRef(dl.downloads); downloadsRef.current = dl.downloads;
  const assignmentsRef = useRef(assignments); assignmentsRef.current = assignments;
  const customMods = customs.customs.map(c => ({ ...c, enabled:loadout.customs.includes(c.name) }));
  const selectedDownloads = dl.downloads.filter(d => loadout.skins[d.champion_name] === d.skin_name);
  const enabledMods = customMods.filter(c => c.enabled);
  const selectionCount = selectedDownloads.length + enabledMods.length;
  const sidebarDownloads = selectedDownloads.slice(0, 4);
  const sidebarMods = enabledMods.slice(0, Math.max(0, 4-sidebarDownloads.length));
  const sidebarRemaining = selectionCount-sidebarDownloads.length-sidebarMods.length;

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("glass:theme",theme); if(native) void getCurrentWebviewWindow().setTheme(theme === "light" ? "light" : "dark").catch(() => {}); }, [theme, native]);
  useEffect(() => { document.documentElement.dataset.accent = accent; localStorage.setItem("glass:accent",accent); }, [accent]);
  useEffect(() => { if (native) getCurrentWebviewWindow().show().catch(() => {}); }, [native]);
  useEffect(() => { ensureSkinIds().catch(() => {}); ensureRepoZips().catch(() => {}); ensureChromaInfo().catch(() => {}); }, []);
  useEffect(() => { if (patcher.error) setToastMessage(patcher.error); }, [patcher.error]);
  useEffect(() => { if (customs.error) setToastMessage(customs.error); }, [customs.error]);

  // Every selection update uses the newest loadout, including consecutive imports.
  const commitLoadout = useCallback((next: Loadout, mods = modsRef.current) => {
    loadoutRef.current = next; setLoadout(next);
    localStorage.setItem("cstm:loadout", JSON.stringify(next));
    if (patcherRef.current.isActive) {
      const paths = loadoutPaths(next, downloadsRef.current, mods);
      if (paths.length) void patcherRef.current.apply(paths); else void patcherRef.current.stop();
    }
  }, []);
  function selectLook(skin: Skin, enabled: boolean) {
    commitLoadout(chooseSkin(loadoutRef.current, skin, enabled, modsRef.current, champions, assignmentsRef.current));
  }
  function toggleCustom(mod: CustomMod) {
    try { commitLoadout(chooseCustom(loadoutRef.current, mod, !loadoutRef.current.customs.includes(mod.name), modsRef.current, champions, assignmentsRef.current)); }
    catch (e) { setToastMessage(String(e)); }
  }
  async function addCustom(path: string) {
    const roster = await ensureChampions().catch(() => champions);
    const mod = await customs.addCustom(path);
    const mods = [...modsRef.current.filter(c => c.name !== mod.name), mod]; modsRef.current = mods;
    if (customTargets(mod, roster, assignmentsRef.current).length) commitLoadout(chooseCustom(loadoutRef.current, mod, true, mods, roster, assignmentsRef.current), mods);
    
  }
  function assignCustom(name: string, champion: string) {
    const nextAssignments = { ...assignmentsRef.current, [name]:champion };
    assignmentsRef.current = nextAssignments; setAssignments(nextAssignments); localStorage.setItem("cstm:mod-champions",JSON.stringify(nextAssignments));
    const mod = modsRef.current.find(c => c.name === name);
    if (mod && loadoutRef.current.customs.includes(name)) {
      const disabled = chooseCustom(loadoutRef.current,mod,false,modsRef.current,champions,nextAssignments);
      commitLoadout(champion ? chooseCustom(disabled,mod,true,modsRef.current,champions,nextAssignments) : disabled);
    }
  }
  async function removeCustom(name: string) {
    commitLoadout({ ...loadoutRef.current, customs:loadoutRef.current.customs.filter(n => n !== name) });
    try { await customs.remove(name); } catch (e) { setToastMessage(String(e)); }
  }
  function handleNav(id: View) { setArtwork(null); setView(id); setSelectedChampion(null); setSelectedSkinId(null);setPreviewSkin(null); }
  function openChampion(champion: Champion, skinId?: string, skin?: Skin, origin: "champions" | "whats-new" = "champions") { setGalleryOrigin(origin); setView("champions"); setSelectedSkinId(skinId ?? null); setPreviewSkin(skin ?? null); setSelectedChampion(champion); }
  function applySelection() { const paths = loadoutPaths(loadoutRef.current, downloadsRef.current, modsRef.current); if (paths.length) void patcher.apply(paths); }

  function disableSkin(champion: string) { commitLoadout({ ...loadoutRef.current, skins:Object.fromEntries(Object.entries(loadoutRef.current.skins).filter(([name])=>name!==champion)) }); }

  function content() {
    if (view === "whats-new") return <NewReleases onSelect={(champion,skin)=>openChampion(champion,skin.id,skin,"whats-new")} isDownloaded={dl.isDownloaded}/>;
    if (view === "enabled") return <EnabledSkins downloads={selectedDownloads} customs={enabledMods} champions={champions} assignments={assignments} onDisableSkin={disableSkin} onDisableCustom={name => { const mod=modsRef.current.find(c=>c.name===name); if(mod)toggleCustom(mod); }} onClear={()=>commitLoadout({skins:{},customs:[]})} onOpenChampion={champion=>openChampion(champion)} onOpenCustoms={()=>handleNav("customs")}/>;
    if (view === "settings") return <div className="flex-1 overflow-y-auto"><Settings theme={theme} onThemeChange={setTheme} accent={accent} onAccentChange={setAccent} gamePath={gamePath} onPathChange={selectPath} patcherActive={patcher.isActive} onSkinsCleared={async () => { commitLoadout({ ...loadoutRef.current,skins:{} }); await dl.refresh(); }} onCustomsCleared={async () => { commitLoadout({ ...loadoutRef.current,customs:[] }); await customs.refresh(); }}/></div>;
    if (view === "customs") return <Customs customs={customMods} onAdd={addCustom} onRemove={removeCustom} onToggle={name => { const mod = modsRef.current.find(c => c.name === name); if (mod) toggleCustom(mod); }} champions={champions} assignments={assignments} onAssign={assignCustom}/>;
    if (view === "my-skins") return <MySkins downloads={dl.downloads} patcherActive={false} selection={loadout.skins} onSelectionChange={nextSkins => {
      let next = { ...loadoutRef.current, skins:nextSkins };
      for (const [name,skin] of Object.entries(nextSkins)) if (loadoutRef.current.skins[name] !== skin) next = chooseSkin(next,{championName:name,name:skin},true,modsRef.current,champions,assignmentsRef.current);
      commitLoadout(next);
    }} onDelete={dl.deleteSkin}/>;
    if (selectedChampion) return <ChampionDetail key={`${selectedChampion.id}-${selectedSkinId ?? "saved"}`} champion={selectedChampion} initialSkinId={selectedSkinId} initialSkin={previewSkin} backLabel={galleryOrigin === "whats-new" ? "New Releases" : "Champions"} onBack={() => { setView(galleryOrigin);setArtwork(null);setSelectedChampion(null);setSelectedSkinId(null);setPreviewSkin(null); }} isDownloaded={dl.isDownloaded} downloading={dl.downloading} onDownload={async (url,name,skin) => {
      const path = await dl.download(url,name,skin);
      if (path) downloadsRef.current = [...downloadsRef.current.filter(d => !(d.champion_name === name && d.skin_name === skin)),{champion_name:name,skin_name:skin,zip_path:path}];
      return !!path;
    }} selection={loadout.skins} onSelectSkin={selectLook} onArtworkChange={setArtwork}/>;
    return <ChampionGrid onSelect={openChampion} search={catalogSearch} onSearchChange={setCatalogSearch}/>;
  }

  return <div className={`glass-app ${native ? "native" : ""} ${sidebar.collapsed ? "sidebar-collapsed" : ""} ${sidebar.resizing ? "sidebar-resizing" : ""}`} style={{"--sidebar-width":`${sidebar.width}px`} as CSSProperties}>
    <aside className="glass-sidebar" ref={sidebarElement}>
      <div className="brand"><img className="brand-app-icon" src={brandIcon} alt="cstmSKN icon"/><div className="brand-wordmark"><strong className="cstm-wordmark">cstm<span>SKN</span></strong></div><button className="sidebar-toggle" onClick={sidebar.toggle} aria-label={sidebar.collapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebar.collapsed ? "Expand sidebar" : "Collapse sidebar"}><SystemIcon name="sidebar" fallback={PanelLeft} size={18}/></button></div>
      <nav aria-label="Main navigation">{NAV_ITEMS.map(({id,label,icon:Icon,symbol}) => <button key={id} title={label} aria-label={label} aria-current={view === id ? "page" : undefined} onClick={() => handleNav(id)} data-view={id} className={`nav-item ${view === id ? "active" : ""}`}><span className="nav-symbol"><SystemIcon name={symbol} fallback={Icon} size={19}/></span><span className="nav-label">{label}</span>{id === "my-skins" && dl.downloads.length > 0 && <em>{dl.downloads.length}</em>}{id === "customs" && customs.customs.length > 0 && <em>{customs.customs.length}</em>}{id === "enabled" && selectionCount>0 && <em>{selectionCount}</em>}</button>)}</nav>
      <section className="enabled-section" aria-label="Enabled skins"><button className="enabled-heading" onClick={()=>handleNav("enabled")} aria-label="Expand enabled skins" title="Open enabled skins"><SystemIcon name="enabled" fallback={CircleCheck} size={18} className="enabled-heading-icon"/><span className="enabled-title">Enabled</span><em>{selectionCount}</em><SystemIcon name="expand" fallback={Maximize2} size={12} className="enabled-expand-icon"/></button>
        {selectionCount === 0 ? <p className="enabled-empty-label">None</p> : <div className="enabled-list">{sidebarDownloads.map(d => {
          const champion = champions.find(c => c.name === d.champion_name || c.id === d.champion_name);
          return <div className="enabled-item" key={d.zip_path}><button className="enabled-open" title={`${d.champion_name} · ${d.skin_name}`} aria-label={`${d.champion_name} · ${d.skin_name}`} onClick={() => { if(champion) { openChampion(champion); } }}>{champion ? <img src={championAvatar(champion.id)} alt=""/> : <div className="enabled-custom-icon"><ImageIcon size={14}/></div>}<span><strong>{champion?.name ?? d.champion_name}</strong><small>{d.skin_name}</small></span></button><button className="enabled-remove" aria-label={`Disable ${d.skin_name}`} onClick={() => disableSkin(d.champion_name)}><X size={12}/></button></div>;
        })}{sidebarMods.map(mod => <div className="enabled-item" key={mod.file_path}><button className="enabled-open" title={mod.name} aria-label={mod.name} onClick={() => handleNav("customs")}><div className="enabled-custom-icon"><Package size={15}/></div><span><strong>{customTargets(mod,champions,assignments).map(id => champions.find(c => c.id.toLowerCase() === id)?.name ?? id).join(", ") || "Custom mod"}</strong><small>{mod.name}</small></span></button><button className="enabled-remove" aria-label={`Disable ${mod.name}`} onClick={() => toggleCustom(mod)}><X size={12}/></button></div>)}</div>}
        {sidebarRemaining>0 && <button className="enabled-more" onClick={()=>handleNav("enabled")}><span>View all {selectionCount}</span><ChevronRight size={13}/></button>}
      </section>
      <div className="sidebar-bottom"><div className="profile"><div className="profile-avatar">s</div><strong>silentrosehill</strong><button className="theme-button" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} appearance`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <SystemIcon name="sun" fallback={Sun} size={18}/> : <SystemIcon name="moon" fallback={Moon} size={18}/>}</button></div></div>
      <div className="sidebar-resizer" {...sidebar.separator}/>
    </aside>
    <div className="workspace">
      {view!=="champions" && view!=="whats-new" && <div className="view-heading"><h1>{NAV_ITEMS.find(n=>n.id===view)?.label}</h1></div>}
      <main className="flex flex-1 flex-col overflow-hidden"><div className="content-stage" key={`${view}-${selectedChampion?.id ?? "index"}`}>{content()}</div></main><DownloadBar downloading={dl.downloading}/><StatusBar patcherStatus={patcher.status} skinCount={selectedDownloads.length} customCount={enabledMods.length} onApply={applySelection} onStop={patcher.stop}/>
    </div>
    {(toastMessage || dl.error) && <Toast key={toastMessage ?? dl.error ?? ""} message={toastMessage ?? dl.error ?? ""} onClose={() => { setToastMessage(null); dl.clearError(); customs.clearError(); }}/>}
    {native && status !== "game-detected" && <div className="bg-charcoal-400 absolute inset-0 z-50"><GamePathSelector onConfirm={confirmSetup} onSelect={selectPath} onCheck={checkPath} detectedPath={detectedPath} status={status}/></div>}
  </div>;
}
