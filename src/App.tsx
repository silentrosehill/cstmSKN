import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauri } from "@tauri-apps/api/core";
import { Swords, Layers, Package, Settings as SettingsIcon, Moon, Sun, ChevronRight, CircleCheck, Maximize2, X, Image as ImageIcon } from "lucide-react";
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
import MySkins from "./components/MySkins";
import Customs from "./components/Customs";
import Settings from "./components/Settings";
import EnabledSkins from "./components/EnabledSkins";
import Toast from "./components/Toast";
import { chooseSkin, chooseCustom, customTargets, loadoutPaths, type Loadout, type ChampionAssignments } from "./lib/selection";
import type { Champion, CustomMod, Skin } from "./types";
import brandIcon from "./assets/icon.png";

type View = "champions" | "my-skins" | "customs" | "enabled" | "settings";
const NAV_ITEMS: { id: View; label: string; icon: typeof Swords }[] = [
  { id: "champions", label: "Champions", icon: Swords }, { id: "my-skins", label: "Library", icon: Layers },
  { id: "customs", label: "Custom skins", icon: Package }, { id: "enabled", label: "Enabled skins", icon: CircleCheck }, { id: "settings", label: "Settings", icon: SettingsIcon },
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
  const [theme, setTheme] = useState(() => localStorage.getItem("glass:theme") ?? "dark");
  const [accent, setAccent] = useState(() => localStorage.getItem("glass:accent") ?? "lavender");
  const [view, setView] = useState<View>("champions");
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null);
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
  function handleNav(id: View) { setView(id); setSelectedChampion(null); }
  function applySelection() { const paths = loadoutPaths(loadoutRef.current, downloadsRef.current, modsRef.current); if (paths.length) void patcher.apply(paths); }

  function disableSkin(champion: string) { commitLoadout({ ...loadoutRef.current, skins:Object.fromEntries(Object.entries(loadoutRef.current.skins).filter(([name])=>name!==champion)) }); }

  function content() {
    if (view === "enabled") return <EnabledSkins downloads={selectedDownloads} customs={enabledMods} champions={champions} assignments={assignments} onDisableSkin={disableSkin} onDisableCustom={name => { const mod=modsRef.current.find(c=>c.name===name); if(mod)toggleCustom(mod); }} onClear={()=>commitLoadout({skins:{},customs:[]})} onOpenChampion={champion=>{setView("champions");setSelectedChampion(champion);}} onOpenCustoms={()=>handleNav("customs")}/>;
    if (view === "settings") return <div className="flex-1 overflow-y-auto"><Settings theme={theme} onThemeChange={setTheme} accent={accent} onAccentChange={setAccent} gamePath={gamePath} onPathChange={selectPath} patcherActive={patcher.isActive} onSkinsCleared={async () => { commitLoadout({ ...loadoutRef.current,skins:{} }); await dl.refresh(); }} onCustomsCleared={async () => { commitLoadout({ ...loadoutRef.current,customs:[] }); await customs.refresh(); }}/></div>;
    if (view === "customs") return <Customs customs={customMods} onAdd={addCustom} onRemove={removeCustom} onToggle={name => { const mod = modsRef.current.find(c => c.name === name); if (mod) toggleCustom(mod); }} champions={champions} assignments={assignments} onAssign={assignCustom}/>;
    if (view === "my-skins") return <MySkins downloads={dl.downloads} patcherActive={false} selection={loadout.skins} onSelectionChange={nextSkins => {
      let next = { ...loadoutRef.current, skins:nextSkins };
      for (const [name,skin] of Object.entries(nextSkins)) if (loadoutRef.current.skins[name] !== skin) next = chooseSkin(next,{championName:name,name:skin},true,modsRef.current,champions,assignmentsRef.current);
      commitLoadout(next);
    }} onDelete={dl.deleteSkin}/>;
    if (selectedChampion) return <ChampionDetail key={selectedChampion.id} champion={selectedChampion} onBack={() => setSelectedChampion(null)} isDownloaded={dl.isDownloaded} downloading={dl.downloading} onDownload={async (url,name,skin) => {
      const path = await dl.download(url,name,skin);
      if (path) downloadsRef.current = [...downloadsRef.current.filter(d => !(d.champion_name === name && d.skin_name === skin)),{champion_name:name,skin_name:skin,zip_path:path}];
      return !!path;
    }} selection={loadout.skins} onSelectSkin={selectLook}/>;
    return <ChampionGrid onSelect={setSelectedChampion}/>;
  }

  return <div className={`glass-app ${native ? "native" : ""}`}>
    <aside className="glass-sidebar">
      <div className="brand"><img className="brand-app-icon" src={brandIcon} alt="cstmSKN icon"/><div><strong className="cstm-wordmark">cstm<span>SKN</span></strong></div></div>
      <nav aria-label="Main navigation">{NAV_ITEMS.map(({id,label,icon:Icon}) => <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => handleNav(id)} className={`nav-item ${view === id ? "active" : ""}`}><Icon size={19} strokeWidth={1.7}/><span>{label}</span>{id === "my-skins" && dl.downloads.length > 0 && <em>{dl.downloads.length}</em>}{id === "customs" && customs.customs.length > 0 && <em>{customs.customs.length}</em>}{id === "enabled" && selectionCount>0 && <em>{selectionCount}</em>}</button>)}</nav>
      <section className="enabled-section" aria-label="Enabled skins"><button className="enabled-heading" onClick={()=>handleNav("enabled")} aria-label="Expand enabled skins" title="Open enabled skins"><span>Enabled</span><em>{selectionCount}</em><Maximize2 size={12}/></button>
        {selectionCount === 0 ? <p className="enabled-empty-label">None</p> : <div className="enabled-list">{sidebarDownloads.map(d => {
          const champion = champions.find(c => c.name === d.champion_name || c.id === d.champion_name);
          return <div className="enabled-item" key={d.zip_path}><button className="enabled-open" onClick={() => { if(champion) { setView("champions");setSelectedChampion(champion); } }}>{champion ? <img src={championAvatar(champion.id)} alt=""/> : <div className="enabled-custom-icon"><ImageIcon size={14}/></div>}<span><strong>{champion?.name ?? d.champion_name}</strong><small>{d.skin_name}</small></span></button><button className="enabled-remove" aria-label={`Disable ${d.skin_name}`} onClick={() => disableSkin(d.champion_name)}><X size={12}/></button></div>;
        })}{sidebarMods.map(mod => <div className="enabled-item" key={mod.file_path}><button className="enabled-open" onClick={() => handleNav("customs")}><div className="enabled-custom-icon"><Package size={15}/></div><span><strong>{customTargets(mod,champions,assignments).map(id => champions.find(c => c.id.toLowerCase() === id)?.name ?? id).join(", ") || "Custom mod"}</strong><small>{mod.name}</small></span></button><button className="enabled-remove" aria-label={`Disable ${mod.name}`} onClick={() => toggleCustom(mod)}><X size={12}/></button></div>)}</div>}
        {sidebarRemaining>0 && <button className="enabled-more" onClick={()=>handleNav("enabled")}>View all {selectionCount}<ChevronRight size={13}/></button>}
      </section>
      <div className="sidebar-bottom"><div className="profile"><div className="profile-avatar">s</div><strong>silentrosehill</strong><button className="theme-button" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} appearance`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button></div></div>
    </aside>
    <div className="workspace">
      {view!=="champions" && <div className="view-heading"><h1>{NAV_ITEMS.find(n=>n.id===view)?.label}</h1></div>}
      <main className="flex flex-1 flex-col overflow-hidden">{content()}</main><DownloadBar downloading={dl.downloading}/><StatusBar patcherStatus={patcher.status} skinCount={selectedDownloads.length} customCount={enabledMods.length} onApply={applySelection} onStop={patcher.stop}/>
    </div>
    {(toastMessage || dl.error) && <Toast key={toastMessage ?? dl.error ?? ""} message={toastMessage ?? dl.error ?? ""} onClose={() => { setToastMessage(null); dl.clearError(); customs.clearError(); }}/>}
    {native && status !== "game-detected" && <div className="bg-charcoal-400 absolute inset-0 z-50"><GamePathSelector onConfirm={confirmSetup} onSelect={selectPath} onCheck={checkPath} detectedPath={detectedPath} status={status}/></div>}
  </div>;
}
