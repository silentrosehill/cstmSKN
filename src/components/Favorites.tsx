import { Search, Star, Package, Check, X } from "lucide-react";
import { useState } from "react";
import type { Favorites as Collection } from "../lib/collections";
import type { CustomMod, Skin } from "../types";
import SkinPortrait from "./SkinPortrait";
import { getSplashNum } from "../hooks/useSkinData";
import { modLabel } from "../lib/mods";

export default function Favorites({
  favorites,
  customs,
  onOpen,
  onRemove,
  onRemoveCustom,
  onOpenCustom,
  isDownloaded,
}: {
  favorites: Collection;
  customs: CustomMod[];
  onOpen: (skin: Skin) => void;
  onRemove: (skin: Skin) => void;
  onRemoveCustom: (name: string) => void;
  onOpenCustom: (mod: CustomMod) => void;
  isDownloaded: (champion: string, skin: string) => boolean;
}) {
  const [query, setQuery] = useState("");
  const matches = (value: string) => value.toLowerCase().includes(query.trim().toLowerCase());
  const skins = favorites.skins.filter((s) => matches(`${s.name} ${s.championName}`));
  const mods = customs.filter((m) => favorites.customs.includes(m.name) && matches(m.name));
  const count =
    favorites.skins.length + customs.filter((m) => favorites.customs.includes(m.name)).length;
  return (
    <div className="collection-view">
      <div className="collection-toolbar">
        <span className="collection-count">{count} favorites</span>
        <div className="search-field">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search favorites"
            aria-label="Search favorites"
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>
      {!count ? (
        <div className="minimal-empty">
          <Star size={30} />
          <h2>Your favorites, together.</h2>
          <p>Star a skin to keep it here.</p>
        </div>
      ) : !skins.length && !mods.length ? (
        <div className="minimal-empty">
          <Search size={26} />
          <h2>No matches</h2>
        </div>
      ) : (
        <div className="favorite-grid">
          {skins.map((skin) => (
            <article className="favorite-card" key={skin.id}>
              <button
                className="favorite-art"
                onClick={() => onOpen(skin)}
                aria-label={`Open ${skin.name}`}
              >
                <SkinPortrait
                  championId={skin.championId}
                  skinNum={getSplashNum(skin)}
                  alt={skin.name}
                />
                {isDownloaded(skin.championName, skin.name) && (
                  <span className="favorite-downloaded" title="Downloaded">
                    <Check size={12} />
                  </span>
                )}
              </button>
              <button
                className="star-button starred"
                aria-label={`Remove ${skin.name} from favorites`}
                aria-pressed={true}
                onClick={() => onRemove(skin)}
              >
                <Star size={15} fill="currentColor" />
              </button>
              <button className="favorite-caption" onClick={() => onOpen(skin)}>
                <span>{skin.championName}</span>
                <strong>{skin.name}</strong>
              </button>
            </article>
          ))}
          {mods.map((mod) => (
            <article className="favorite-card favorite-custom" key={mod.file_path}>
              <button
                className="favorite-art"
                onClick={() => onOpenCustom(mod)}
                aria-label={`Open ${mod.name}`}
              >
                <Package size={40} />
              </button>
              <button
                className="star-button starred"
                aria-label={`Remove ${mod.name} from favorites`}
                aria-pressed={true}
                onClick={() => onRemoveCustom(mod.name)}
              >
                <Star size={15} fill="currentColor" />
              </button>
              <button className="favorite-caption" onClick={() => onOpenCustom(mod)}>
                <span>{modLabel(mod)}</span>
                <strong>{mod.name}</strong>
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
