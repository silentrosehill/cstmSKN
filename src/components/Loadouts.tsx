import { useState } from "react";
import { Check, Layers, Plus, Trash2, RefreshCw, ChevronDown, X } from "lucide-react";
import type { SavedLoadout } from "../lib/collections";
import { restoreLoadout } from "../lib/collections";
import type { Loadout, ChampionAssignments } from "../lib/selection";
import type { Champion, CustomMod, DownloadedSkin } from "../types";

export default function Loadouts({
  saved,
  onChange,
  current,
  downloads,
  customs,
  champions,
  assignments,
  onUse,
}: {
  saved: SavedLoadout[];
  onChange: (fn: (saved: SavedLoadout[]) => SavedLoadout[]) => void;
  current: Loadout;
  downloads: DownloadedSkin[];
  customs: CustomMod[];
  champions: Champion[];
  assignments: ChampionAssignments;
  onUse: (saved: SavedLoadout) => void;
}) {
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const count = Object.keys(current.skins).length + current.customs.length;
  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !count) return;
    onChange((list) => [
      ...list,
      {
        id:
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: name.trim().slice(0, 60),
        savedAt: new Date().toISOString(),
        selection: { skins: { ...current.skins }, customs: [...current.customs] },
      },
    ]);
    setName("");
  }
  const same = (selection: Loadout) =>
    JSON.stringify(Object.entries(selection.skins).sort()) ===
      JSON.stringify(Object.entries(current.skins).sort()) &&
    [...selection.customs].sort().join("\0") === [...current.customs].sort().join("\0");
  return (
    <div className="collection-view">
      <form className="save-loadout" onSubmit={save}>
        <span className="loadout-icon">
          <Layers size={23} />
        </span>
        <div>
          <h2>Save your current setup</h2>
          <p>
            {count
              ? `${count} enabled ${count === 1 ? "item" : "items"}`
              : "Enable skins or mods to create a loadout."}
          </p>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Loadout name"
          aria-label="Loadout name"
        />
        <button className="primary-button" disabled={!count || !name.trim()}>
          <Plus size={15} />
          Save
        </button>
      </form>
      {!saved.length ? (
        <div className="minimal-empty">
          <Layers size={30} />
          <h2>A setup for every mood.</h2>
        </div>
      ) : (
        <div className="loadouts-grid">
          {saved.map((item) => {
            const { selection, missing } = restoreLoadout(
              item.selection,
              downloads,
              customs,
              champions,
              assignments
            );
            const total = Object.keys(item.selection.skins).length + item.selection.customs.length;
            const available = Object.keys(selection.skins).length + selection.customs.length;
            const active = !missing.length && same(item.selection);
            return (
              <article className={`loadout-card ${active ? "current" : ""}`} key={item.id}>
                <div className="loadout-card-top">
                  <span className="loadout-icon">
                    <Layers size={22} />
                  </span>
                  <div>
                    <h2>{item.name}</h2>
                    <p>
                      {total} {total === 1 ? "item" : "items"}
                      {active ? " · Current" : ""}
                    </p>
                  </div>
                  <button
                    className="icon-button"
                    title={`Delete ${item.name}`}
                    aria-label={`Delete ${item.name}`}
                    onClick={() => setDeleting(item.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <details className="loadout-details">
                  <summary>
                    Included items
                    <ChevronDown size={12} />
                  </summary>
                  <ul>
                    {Object.entries(item.selection.skins).map(([champion, skin]) => (
                      <li key={champion}>
                        <span>{champion}</span>
                        <strong>{skin}</strong>
                      </li>
                    ))}
                    {item.selection.customs.map((mod) => (
                      <li key={mod}>
                        <span>Custom</span>
                        <strong>{mod}</strong>
                      </li>
                    ))}
                  </ul>
                </details>
                {!!missing.length && (
                  <p className="loadout-warning">
                    {missing.length} unavailable · {missing.join(", ")}
                  </p>
                )}
                <div className="loadout-card-actions">
                  <button
                    className="quiet-button"
                    disabled={!count}
                    onClick={() =>
                      onChange((list) =>
                        list.map((entry) =>
                          entry.id === item.id
                            ? {
                                ...entry,
                                savedAt: new Date().toISOString(),
                                selection: {
                                  skins: { ...current.skins },
                                  customs: [...current.customs],
                                },
                              }
                            : entry
                        )
                      )
                    }
                    title="Replace saved contents with your current selection"
                  >
                    <RefreshCw size={13} />
                    Overwrite
                  </button>
                  <button
                    className={active ? "quiet-button" : "primary-button"}
                    disabled={!available || active}
                    onClick={() => onUse(item)}
                  >
                    {active ? <Check size={14} /> : <Layers size={14} />}{" "}
                    {active ? "Current" : missing.length ? "Use available" : "Use loadout"}
                  </button>
                </div>
                {deleting === item.id && (
                  <div className="loadout-delete-confirm">
                    <span>Delete this saved loadout?</span>
                    <button
                      className="quiet-button"
                      onClick={() => setDeleting(null)}
                      aria-label="Cancel deletion"
                    >
                      <X size={13} />
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => {
                        onChange((list) => list.filter((entry) => entry.id !== item.id));
                        setDeleting(null);
                      }}
                    >
                      Delete
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
