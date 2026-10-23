import { useState, useEffect, useCallback } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import { Upload, Trash2, Check, FileArchive, Package, Loader2, Search, X } from "lucide-react";
import { customTargets, type ChampionAssignments } from "../lib/selection";
import { splashUrl } from "../hooks/useChampions";
import type { Champion, CustomMod } from "../types";
interface Props {
  customs: CustomMod[];
  onAdd: (path: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  onToggle: (name: string) => void;
  champions: Champion[];
  assignments: ChampionAssignments;
  onAssign: (name: string, champion: string) => void;
}
export default function Customs({ customs, onAdd, onRemove, onToggle, champions, assignments, onAssign }: Props) {
  const [dragging,setDragging]=useState(false);
  const [adding,setAdding]=useState<string|null>(null);
  const [search,setSearch]=useState("");
  const [error,setError]=useState<string|null>(null);
  const importPaths=useCallback(async(paths:string[])=>{
    for(const path of paths.filter(p=>/\.(zip|fantome)$/i.test(p))){
      setAdding(path.split('/').pop()??path);setError(null);
      try{await onAdd(path);}catch(e){setError(String(e));}finally{setAdding(null);}
    }
  },[onAdd]);
  useEffect(()=>{
    if(!isTauri())return;
    let unlisten:(()=>void)|undefined;let cancelled=false;
    getCurrentWebviewWindow().onDragDropEvent(event=>{
      if(event.payload.type==="drop"){setDragging(false);void importPaths(event.payload.paths);}
      else setDragging(event.payload.type!=="leave");
    }).then(fn=>{if(cancelled)fn();else unlisten=fn;}).catch(e=>setError(String(e)));
    return()=>{cancelled=true;unlisten?.();};
  },[importPaths]);
  async function browse(){
    if(!isTauri()){setError("Import is available in the desktop app.");return;}
    try{const result=await open({multiple:true,filters:[{name:"Custom skins",extensions:["zip","fantome"]}]});if(result)await importPaths(Array.isArray(result)?result:[result]);}catch(e){setError(String(e));}
  }
  const filtered=customs.filter(mod=>`${mod.name} ${customTargets(mod,champions,assignments).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="customs-view"><div className="custom-toolbar"><span className="collection-count">{customs.length} {customs.length===1?"skin":"skins"}</span><div className="search-field"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search custom skins" aria-label="Search custom skins"/>{search&&<button aria-label="Clear search" onClick={()=>setSearch("")}><X size={13}/></button>}</div><button className="primary-button" onClick={browse} disabled={!!adding}>{adding?<Loader2 size={14} className="animate-spin"/>:<Upload size={14}/>}Import</button></div>
    <button className={`custom-dropzone ${dragging?"dragging":""}`} onClick={browse} disabled={!!adding}><Upload size={16}/><span>{adding?`Importing ${adding}…`:"Drop .fantome or .zip files"}</span></button>
    {error&&<p role="alert" className="custom-error">{error}</p>}
    {customs.length===0?<div className="minimal-empty"><Package size={30}/><h2>No custom skins</h2></div>:filtered.length===0?<div className="minimal-empty"><Search size={26}/><h2>No matches</h2></div>:<div className="custom-mod-grid">{filtered.map(mod=>{
      const automatic=customTargets(mod,champions,{});
      const targets=customTargets(mod,champions,assignments);
      const roster=targets.map(id=>champions.find(c=>c.id.toLowerCase()===id)).filter((c):c is Champion=>!!c);
      const label=roster.map(c=>c.name).join(", ");
      return <article key={mod.name} className={`custom-mod ${mod.enabled?"enabled":""}`}><div className="custom-art">{roster[0]?<img src={splashUrl(roster[0].id,0)} alt={roster[0].name} loading="lazy"/>:<FileArchive size={32}/>}<button className="custom-remove" aria-label={`Remove ${mod.name}`} onClick={async()=>{try{await onRemove(mod.name);}catch(e){setError(String(e));}}}><Trash2 size={13}/></button>{mod.enabled&&<span className="custom-enabled-mark"><Check size={12}/></span>}</div><div className="custom-card-info"><span className="custom-champion-label">{label||"Unidentified"}</span><h3>{mod.name}</h3>{automatic.length===0&&<select aria-label={`Champion for ${mod.name}`} value={assignments[mod.name]??""} onChange={e=>onAssign(mod.name,e.target.value)}><option value="">Choose champion</option>{champions.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}<button className={`custom-toggle ${mod.enabled?"enabled":""}`} disabled={!targets.length} aria-pressed={mod.enabled} onClick={()=>onToggle(mod.name)}>{mod.enabled?<Check size={14}/>:<Package size={14}/>} {mod.enabled?"Enabled":"Enable"}</button></div></article>;
    })}</div>}
  </div>;
}
