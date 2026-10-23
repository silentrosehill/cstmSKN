import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Upload,
  Trash2,
  Check,
  FileArchive,
  Package,
  Loader2,
  Search,
  X,
  Star,
  Mic2,
  Map,
  AudioLines,
  Shapes,
} from "lucide-react";
import { customTargets, type ChampionAssignments } from "../lib/selection";
import { MOD_CATEGORIES, modKind, modLabel, supportedModPath } from "../lib/mods";
import { splashUrl } from "../hooks/useChampions";
import SystemIcon from "./SystemIcon";
import type { Champion, CustomMod, ModKind } from "../types";
export interface CustomsProps {
  customs: CustomMod[];
  onAdd: (path: string, kind?: ModKind) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
  onToggle: (name: string) => void;
  champions: Champion[];
  assignments: ChampionAssignments;
  onAssign: (name: string, champion: string) => void;
  onKind: (name: string, kind: ModKind) => Promise<void>;
  favorites: string[];
  onFavorite: (name: string) => void;
  gameMods?: boolean;
  importing: boolean;
  importKind: ModKind;
  onImportKindChange: (kind: ModKind) => void;
}
export const modIcons = {
  skin: Package,
  announcer: Mic2,
  voice: AudioLines,
  map: Map,
  other: Shapes,
};
export default function Customs({
  customs,
  onAdd,
  onRemove,
  onToggle,
  champions,
  assignments,
  onAssign,
  onKind,
  favorites,
  onFavorite,
  gameMods = false,
  importing,
  importKind,
  onImportKindChange,
}: CustomsProps) {
  const [adding, setAdding] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  async function browse() {
    if (!isTauri()) {
      setError("Import is available in the desktop app.");
      return;
    }
    try {
      const result = await open({
        multiple: true,
        filters: [
          {
            name: gameMods ? "Game mods" : "Custom skins",
            extensions: ["zip", "fantome", "wad", "client"],
          },
        ],
      });
      for (const path of (Array.isArray(result) ? result : result ? [result] : []).filter(
        supportedModPath
      )) {
        setAdding(path.split("/").pop() ?? path);
        setError(null);
        try {
          await onAdd(path, gameMods ? importKind : undefined);
        } catch (e) {
          setError(String(e));
        } finally {
          setAdding(null);
        }
      }
    } catch (e) {
      setError(String(e));
    }
  }
  const filtered = customs.filter(
    (mod) =>
      (category === "all" || modKind(mod) === category) &&
      `${mod.name} ${customTargets(mod, champions, assignments).join(" ")}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
  );
  return (
    <div className={`customs-view ${gameMods ? "game-mods-view" : ""}`}>
      {gameMods && (
        <div className="game-mods-intro">
          <h2>Make the Rift your own.</h2>
          <p>Announcers, champion voices, maps, and more.</p>
        </div>
      )}
      {gameMods && (
        <div className="mod-category-tabs" role="group" aria-label="Mod category">
          <button
            className={category === "all" ? "selected" : ""}
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            All mods
          </button>
          {MOD_CATEGORIES.map(({ id, label }) => {
            const Icon = modIcons[id];
            return (
              <button
                key={id}
                className={category === id ? "selected" : ""}
                aria-pressed={category === id}
                onClick={() => {
                  setCategory(id);
                  onImportKindChange(id);
                }}
              >
                <SystemIcon name={id} fallback={Icon} size={14} />
                {label}
              </button>
            );
          })}
        </div>
      )}
      <div className="custom-toolbar">
        <span className="collection-count">
          {customs.length}{" "}
          {gameMods
            ? customs.length === 1
              ? "mod"
              : "mods"
            : customs.length === 1
              ? "skin"
              : "skins"}
        </span>
        <div className="search-field">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={gameMods ? "Search game mods" : "Search custom skins"}
            aria-label={gameMods ? "Search game mods" : "Search custom skins"}
          />
          {search && (
            <button aria-label="Clear search" onClick={() => setSearch("")}>
              <X size={13} />
            </button>
          )}
        </div>
        {gameMods && (
          <select
            className="mod-import-kind"
            value={importKind}
            onChange={(e) => onImportKindChange(e.target.value as ModKind)}
            aria-label="Import category"
          >
            {MOD_CATEGORIES.map(({ id, singular }) => (
              <option key={id} value={id}>
                {singular}
              </option>
            ))}
          </select>
        )}
        <button className="primary-button" onClick={browse} disabled={!!adding || importing}>
          {adding || importing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} />
          )}
          Import
        </button>
      </div>
      <button className="custom-dropzone" onClick={browse} disabled={!!adding || importing}>
        <Upload size={16} />
        <span>
          {adding ? `Importing ${adding}…` : "Drop .fantome, .zip or .wad files anywhere"}
        </span>
      </button>
      {error && (
        <p role="alert" className="custom-error">
          {error}
        </p>
      )}
      {customs.length === 0 ? (
        <div className="minimal-empty">
          <Package size={30} />
          <h2>{gameMods ? "Your Rift, remixed." : "No custom skins"}</h2>
          {gameMods && <p>Import a ready-to-use mod package to get started.</p>}
        </div>
      ) : filtered.length === 0 ? (
        <div className="minimal-empty">
          <Search size={26} />
          <h2>No matches</h2>
        </div>
      ) : (
        <div className="custom-mod-grid">
          {filtered.map((mod) => {
            const automatic = customTargets(mod, champions, {});
            const targets = customTargets(mod, champions, assignments);
            const roster = targets
              .map((id) => champions.find((c) => c.id.toLowerCase() === id))
              .filter((c): c is Champion => !!c);
            const label = roster.map((c) => c.name).join(", ");
            const needsChampion = ["skin", "voice"].includes(modKind(mod));
            const Icon = modIcons[modKind(mod)] ?? FileArchive;
            return (
              <article key={mod.name} className={`custom-mod ${mod.enabled ? "enabled" : ""}`}>
                <div className={`custom-art mod-art-${modKind(mod)}`}>
                  {roster[0] && needsChampion ? (
                    <img src={splashUrl(roster[0].id, 0)} alt={roster[0].name} loading="lazy" />
                  ) : (
                    <SystemIcon name={modKind(mod)} fallback={Icon} size={40} />
                  )}
                  <button
                    className="custom-remove"
                    aria-label={`Remove ${mod.name}`}
                    onClick={() => setRemoving(mod.name)}
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    className={`star-button ${favorites.includes(mod.name) ? "starred" : ""}`}
                    aria-label={`${favorites.includes(mod.name) ? "Unfavorite" : "Favorite"} ${mod.name}`}
                    aria-pressed={favorites.includes(mod.name)}
                    onClick={() => onFavorite(mod.name)}
                  >
                    <Star size={14} fill={favorites.includes(mod.name) ? "currentColor" : "none"} />
                  </button>
                  {mod.enabled && (
                    <span className="custom-enabled-mark">
                      <Check size={12} />
                    </span>
                  )}
                </div>
                <div className="custom-card-info">
                  <span className="custom-champion-label">{label || modLabel(mod)}</span>
                  <h3 title={mod.name}>{mod.name}</h3>
                  <select
                    disabled={editing === mod.name}
                    aria-label={`Category for ${mod.name}`}
                    value={modKind(mod)}
                    onChange={async (e) => {
                      setEditing(mod.name);
                      try {
                        await onKind(mod.name, e.target.value as ModKind);
                      } catch (e) {
                        setError(String(e));
                      } finally {
                        setEditing(null);
                      }
                    }}
                  >
                    <option value="skin">Custom skin</option>
                    {MOD_CATEGORIES.map(({ id, singular }) => (
                      <option key={id} value={id}>
                        {singular}
                      </option>
                    ))}
                  </select>
                  {automatic.length === 0 && needsChampion && (
                    <select
                      aria-label={`Champion for ${mod.name}`}
                      value={assignments[mod.name] ?? ""}
                      onChange={(e) => onAssign(mod.name, e.target.value)}
                    >
                      <option value="">Choose champion</option>
                      {champions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    className={`custom-toggle ${mod.enabled ? "enabled" : ""}`}
                    disabled={(needsChampion && !targets.length) || editing === mod.name}
                    aria-pressed={mod.enabled}
                    onClick={() => onToggle(mod.name)}
                  >
                    {mod.enabled ? <Check size={14} /> : <Icon size={14} />}{" "}
                    {mod.enabled ? "Enabled" : "Enable"}
                  </button>
                </div>
                {removing === mod.name && (
                  <div className="mod-delete-confirm">
                    <span>Remove this import?</span>
                    <button className="quiet-button" onClick={() => setRemoving(null)}>
                      Cancel
                    </button>
                    <button
                      className="danger-button"
                      onClick={async () => {
                        try {
                          await onRemove(mod.name);
                          setRemoving(null);
                        } catch (e) {
                          setError(String(e));
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
