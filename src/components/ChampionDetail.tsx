import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Check, CheckCircle2, Download, Loader2, Palette, ImageOff, Sparkles } from "lucide-react";
import { useSkinData, skinDownloadUrl, getSplashNum } from "../hooks/useSkinData";
import { splashUrl, championAvatar } from "../hooks/useChampions";
import { galleryIndex } from "../lib/selection";
import type { Champion, Skin } from "../types";

interface Props {
  champion: Champion;
  onBack: () => void;
  isDownloaded: (championName: string, skinName: string) => boolean;
  downloading: string | null;
  onDownload: (url: string, championName: string, skinName: string) => Promise<boolean>;
  selection: Record<string, string>;
  onSelectSkin: (skin: Skin, selected: boolean) => void;
}

function Artwork({ skin, thumbnail = false }: { skin: Skin; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = splashUrl(skin.championId, getSplashNum(skin));
  return <>{!loaded && !failed && !thumbnail && <div className="gallery-art-loading"><Loader2 size={24} className="animate-spin"/><span>Loading artwork…</span></div>}{failed ? <div className="gallery-no-art"><ImageOff size={thumbnail ? 18 : 32}/>{!thumbnail && <span>Artwork isn’t available for this skin.</span>}</div> : <img src={src} alt={skin.name} loading={thumbnail ? "lazy" : "eager"} draggable={false} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} style={{opacity:loaded ? 1 : 0}}/>}</>;
}

export default function ChampionDetail({ champion, onBack, isDownloaded, downloading, onDownload, selection, onSelectSkin }: Props) {
  const { groups, loading, error } = useSkinData(champion);
  const [index, setIndex] = useState(0);
  const [chromaId, setChromaId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedThumb = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const initialized = useRef(false);
  const group = groups[index];
  const skin = group?.chromas.find(c => c.id === chromaId) ?? group?.base;
  const downloaded = skin ? isDownloaded(skin.championName, skin.name) : false;
  const selected = !!skin && selection[skin.championName] === skin.name;
  const downloadUrl = skin ? skinDownloadUrl(skin) : null;
  const busy = downloading !== null || saving;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (initialized.current || groups.length === 0) return;
    initialized.current = true;
    const savedIndex = groups.findIndex(g => selection[g.base.championName] === g.base.name || g.chromas.some(c => selection[c.championName] === c.name));
    if (savedIndex >= 0) { setIndex(savedIndex); const g = groups[savedIndex]; setChromaId(g.chromas.find(c => selection[c.championName] === c.name)?.id ?? null); }
  }, [groups, selection]);
  function navigate(delta: number) { setIndex(i => galleryIndex(i, groups.length, delta)); setChromaId(null); setActionError(null); }
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || (e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)))) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); navigate(e.key === "ArrowLeft" ? -1 : 1); }
      if (e.key === "Escape") onBack();
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [groups.length, onBack]);
  useEffect(() => { selectedThumb.current?.scrollIntoView({ block:"nearest", inline:"nearest", behavior:"smooth" }); }, [index]);

  async function downloadCurrent() {
    if (!skin || !downloadUrl || busy ) return;
    const requestedSkin = skin;
    setSaving(true); setActionError(null);
    try {
      const success = await onDownload(downloadUrl, requestedSkin.championName, requestedSkin.name);
      if (success) onSelectSkin(requestedSkin, true);
    } catch (e) { if (mounted.current) setActionError(String(e)); }
    finally { if (mounted.current) setSaving(false); }
  }

  return <div className="skin-gallery">
    <div className="gallery-toolbar"><button className="gallery-back" onClick={onBack}><ArrowLeft size={16}/><span>Champions</span></button><div className="gallery-champion"><img src={championAvatar(champion.id)} alt=""/><strong>{champion.name}</strong><span>{champion.title}</span></div><div className="gallery-count">{loading ? "Loading…" : `${groups.length} looks`}</div></div>
    {loading ? <div className="gallery-state"><Loader2 size={28} className="animate-spin"/><h2>Loading skins…</h2></div> : error ? <div className="gallery-state"><ImageOff size={28}/><h2>Couldn’t load this collection.</h2><p>{error}</p><button className="primary-button" onClick={onBack}>Back to champions</button></div> : !skin ? <div className="gallery-state"><Sparkles size={30}/><h2>No skins available</h2><button className="primary-button" onClick={onBack}>Back to champions</button></div> : <div className="gallery-content">
      <section className="gallery-stage" aria-label="Skin artwork viewer">
        <div className="gallery-ambient" style={{backgroundImage:`url("${splashUrl(skin.championId, getSplashNum(skin))}")`}}/>
        <div className="gallery-art" key={`${skin.championId}-${getSplashNum(skin)}`}><Artwork skin={skin}/></div>
        <button className="gallery-arrow prev" onClick={() => navigate(-1)} disabled={groups.length < 2} aria-label="Previous skin"><ChevronLeft size={24}/></button>
        <button className="gallery-arrow next" onClick={() => navigate(1)} disabled={groups.length < 2} aria-label="Next skin"><ChevronRight size={24}/></button>
        <div className="gallery-art-caption"><span>{skin.name}</span><small>{index + 1} / {groups.length}</small></div>
        {downloaded && <span className="gallery-downloaded" title="Downloaded"><CheckCircle2 size={14}/></span>}
      </section>
      <aside className="gallery-inspector"><h1>{skin.name}</h1><p className="gallery-champion-name">{champion.name}</p><div className="gallery-status">{downloaded ? <><CheckCircle2 size={15}/><span>Downloaded</span></> : <><Download size={14}/><span>{downloadUrl ? "Ready to download" : "Currently unavailable"}</span></>}</div>
        {group.chromas.length > 0 && <div className="gallery-chromas"><div><Palette size={14}/><strong>Chromas</strong><span>{group.chromas.length}</span></div><div className="gallery-swatches"><button className={`base-swatch ${!chromaId ? "chosen" : ""}`} onClick={() => setChromaId(null)} aria-pressed={!chromaId} title="Base skin" aria-label="Base skin"><img src={splashUrl(group.base.championId, getSplashNum(group.base))} alt=""/></button>{group.chromas.map(c => <button key={c.id} aria-label={c.name} title={`${c.name}${isDownloaded(c.championName,c.name) ? " · Downloaded" : ""}`} aria-pressed={chromaId === c.id} onClick={() => setChromaId(c.id)} className={chromaId === c.id ? "chosen" : ""} style={{background:c.colors.length > 1 ? `linear-gradient(135deg,${c.colors[0]} 50%,${c.colors[1]} 50%)` : c.colors[0] ?? "#94a0b7"}}>{isDownloaded(c.championName,c.name) && <Check size={10}/>}</button>)}</div></div>}
        <div className="gallery-actions">{downloaded ? <button className={`gallery-select-button ${selected ? "is-selected" : ""}`} aria-pressed={selected} onClick={() => onSelectSkin(skin, !selected)}>{selected ? <CheckCircle2 size={16}/> : <Check size={16}/>} {selected ? "Selected" : "Use this skin"}</button> : <button className="primary-button" disabled={busy || !downloadUrl} onClick={downloadCurrent}>{busy ? <Loader2 size={15} className="animate-spin"/> : <Download size={15}/>} {saving ? "Downloading…" : busy ? "Download in progress…" : "Download & select"}</button>}
          {actionError && <p role="alert" className="text-error text-xs">{actionError}</p>}
        </div>
      </aside>
      <div className="gallery-filmstrip" role="group" aria-label={`${champion.name} skins`}>{groups.map((g,i) => <button key={g.base.id} ref={i === index ? selectedThumb : undefined} className={`gallery-thumb ${i === index ? "current" : ""}`} aria-pressed={i === index} aria-label={g.base.name} title={g.base.name} onClick={() => { setIndex(i); setChromaId(null); setActionError(null); }}><div className="gallery-thumb-art"><Artwork skin={g.base} thumbnail/>{isDownloaded(g.base.championName,g.base.name) && <span className="thumb-downloaded" aria-label="Downloaded"><Check size={10} strokeWidth={3}/></span>}{selection[g.base.championName] === g.base.name && <span className="thumb-selected"/>}</div><span>{g.base.name}</span></button>)}</div>
    </div>}
  </div>;
}
