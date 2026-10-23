import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, CircleCheck, Package, Search, X } from "lucide-react";
import { championAvatar, splashUrl } from "../hooks/useChampions";
import { lookupSplashNum, ensureSkinIds } from "../hooks/useSkinData";
import { customTargets, type ChampionAssignments } from "../lib/selection";
import type { Champion, CustomMod, DownloadedSkin } from "../types";

interface Props {
  downloads: DownloadedSkin[];
  customs: CustomMod[];
  champions: Champion[];
  assignments: ChampionAssignments;
  onDisableSkin: (champion: string) => void;
  onDisableCustom: (name: string) => void;
  onClear: () => void;
  onOpenChampion: (champion: Champion) => void;
  onOpenCustoms: () => void;
}
export default function EnabledSkins({downloads,customs,champions,assignments,onDisableSkin,onDisableCustom,onClear,onOpenChampion,onOpenCustoms}:Props) {
  const [artReady,setArtReady]=useState(false);
  useEffect(()=>{let active=true;void ensureSkinIds().then(()=>{if(active)setArtReady(true);}).catch(()=>{});return()=>{active=false;};},[]);
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("All");
  const entries=useMemo(() => {
    const regular=downloads.map(d => {
      const champion=champions.find(c => c.id===d.champion_name || c.name===d.champion_name);
      const splash=lookupSplashNum(d.skin_name);
      return {id:d.zip_path,name:d.skin_name,label:champion?.name ?? d.champion_name,kind:"Skins",champion,image:champion ? splash!==null ? splashUrl(champion.id,splash) : championAvatar(champion.id) : null,disable:()=>onDisableSkin(d.champion_name)};
    });
    const custom=customs.map(mod => {
      const targets=customTargets(mod,champions,assignments);
      const roster=targets.map(id => champions.find(c => c.id.toLowerCase()===id)).filter((c):c is Champion=>!!c);
      return {id:mod.file_path,name:mod.name,label:roster.map(c=>c.name).join(", ") || "Custom",kind:"Custom",champion:roster[0],image:roster[0] ? splashUrl(roster[0].id,0) : null,disable:()=>onDisableCustom(mod.name)};
    });
    return [...regular,...custom].sort((a,b)=>a.label.localeCompare(b.label));
  },[downloads,customs,champions,assignments,onDisableSkin,onDisableCustom,artReady]);
  const query=search.trim().toLowerCase();
  const filtered=entries.filter(e=>(filter==="All" || e.kind===filter) && `${e.name} ${e.label}`.toLowerCase().includes(query));
  return <div className="enabled-view">
    <div className="enabled-view-toolbar"><div className="role-filters" aria-label="Filter enabled skins">{["All","Skins","Custom"].map(f=><button key={f} aria-pressed={filter===f} className={filter===f?"selected":""} onClick={()=>setFilter(f)}>{f}{f==="All" && <span>{entries.length}</span>}</button>)}</div><div className="search-field"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search enabled skins" aria-label="Search enabled skins"/>{search && <button aria-label="Clear search" onClick={()=>setSearch("")}><X size={13}/></button>}</div>{entries.length>0 && <button className="quiet-button" onClick={onClear}>Disable all</button>}</div>
    {entries.length===0 ? <div className="minimal-empty"><CircleCheck size={30}/><h2>No enabled skins</h2></div> : filtered.length===0 ? <div className="minimal-empty"><Search size={26}/><h2>No matches</h2></div> : <div className="enabled-grid">{filtered.map(e=><article className="enabled-look" key={e.id}><button className="enabled-look-preview" aria-label={`Open ${e.name}`} onClick={()=>{if(e.kind==="Custom")onOpenCustoms();else if(e.champion)onOpenChampion(e.champion);}}>{e.image ? <img src={e.image} alt={e.label} loading="lazy"/> : <Package size={32}/>}<span className="enabled-look-tag">{e.kind==="Custom"?"Custom":"Skin"}</span><span className="enabled-look-open"><ArrowUpRight size={17}/></span></button><div className="enabled-look-info"><div><span>{e.label}</span><h2>{e.name}</h2></div><button className="enabled-look-toggle" onClick={e.disable} aria-label={`Disable ${e.name}`} aria-pressed={true} title="Disable skin"><Check size={15}/></button></div></article>)}</div>}
  </div>;
}
