import { useState, useMemo } from "react";
import { Search, Star, ArrowUpRight, SlidersHorizontal, X, RotateCcw } from "lucide-react";
import { useChampions, splashUrl } from "../hooks/useChampions";
import type { Champion } from "../types";

const ROLES = ["All champions", "Fighter", "Assassin", "Mage", "Marksman", "Support", "Tank"];
export default function ChampionGrid({ onSelect }: { onSelect: (champion: Champion) => void }) {
  const { champions, total, loading, error, search, setSearch } = useChampions();
  const [role, setRole] = useState("All champions");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("glass:favorites") ?? "[]"); } catch { return []; } });
  const [compact, setCompact] = useState(false);
  const list = useMemo(() => champions.filter(c => (role === "All champions" || c.tags.includes(role)) && (!onlyFavorites || favorites.includes(c.id))), [champions, role, onlyFavorites, favorites]);
  function favorite(id: string) { setFavorites(prev => { const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]; localStorage.setItem("glass:favorites", JSON.stringify(next)); return next; }); }
  return <div className="discover-scroll">
    <section className="champion-section"><div className="section-title"><div><h1>Champions <span>{total || "—"}</span></h1></div><div className="catalog-actions"><button className={onlyFavorites ? "icon-button selected" : "icon-button"} onClick={() => setOnlyFavorites(!onlyFavorites)} aria-label="Show favorite champions" aria-pressed={onlyFavorites}><Star size={16} fill={onlyFavorites ? "currentColor" : "none"}/></button><button className="icon-button" aria-label={compact ? "Use spacious grid" : "Use compact grid"} aria-pressed={compact} onClick={() => setCompact(!compact)}><SlidersHorizontal size={16}/></button></div></div>
      <div className="catalog-toolbar"><div className="role-filters" aria-label="Champion roles">{ROLES.map(r => <button className={role === r ? "selected" : ""} key={r} onClick={() => setRole(r)} aria-pressed={role === r}>{r === "All champions" ? "All" : r === "Marksman" ? "Marksman" : r}</button>)}</div><div className="search-field"><Search size={16}/><input aria-label="Search champions" placeholder="Find a champion…" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={13}/></button>}</div></div>
      {loading ? <div className="champion-cards">{Array.from({length:12},(_,i) => <div className="champion-skeleton" key={i}/>)}</div> : error ? <div className="catalog-empty"><p>Champion data couldn’t load.</p><small>{error}</small><button className="primary-button" onClick={() => window.location.reload()}><RotateCcw size={14}/> Try again</button></div> : list.length === 0 ? <div className="catalog-empty"><Search size={26}/><h3>No matches</h3><p>{onlyFavorites ? "No favorites match this filter." : ""}</p><button className="primary-button" onClick={() => { setSearch(""); setRole("All champions"); setOnlyFavorites(false); }}>Show all champions</button></div> : <div className={`champion-cards ${compact ? "compact" : ""}`}>{list.map(champ => <article className="champion-card" key={champ.id}><button className="champion-open" onClick={() => onSelect(champ)} aria-label={`Explore ${champ.name} skins`}><img src={splashUrl(champ.id,0)} alt={champ.name} loading="lazy" draggable={false}/><div className="champion-gradient"/><div className="champion-label"><h3>{champ.name}</h3><span>{champ.title}</span></div><span className="card-arrow"><ArrowUpRight size={16}/></span></button><button className={`favorite-button ${favorites.includes(champ.id) ? "is-favorite" : ""}`} aria-label={`${favorites.includes(champ.id) ? "Unfavorite" : "Favorite"} ${champ.name}`} aria-pressed={favorites.includes(champ.id)} onClick={() => favorite(champ.id)}><Star size={14} fill={favorites.includes(champ.id) ? "currentColor" : "none"}/></button></article>)}</div>}
    </section>
  </div>;
}
