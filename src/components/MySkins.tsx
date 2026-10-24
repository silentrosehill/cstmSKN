import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Layers,
  Check,
  Search,
  Star,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { findChampionByName, championAvatar } from "../hooks/useChampions";
import {
  lookupSplashNum,
  lookupChromaInfo,
  ensureChromaInfo,
  ensureRepoZips,
  ensureSkinIds,
} from "../hooks/useSkinData";
import {
  groupLibrarySkins,
  groupDownloads,
  deckFrontIndex,
  deckVariant,
  deckTarget,
} from "../lib/libraryDeck";
import type { ChampionDeck } from "../lib/libraryDeck";
import type { DownloadedSkin } from "../types";
import SkinPortrait from "./SkinPortrait";
import SystemIcon from "./SystemIcon";

type Selection = Record<string, string>;
interface MySkinsProps {
  downloads: DownloadedSkin[];
  isFavorite: (champion: string, skin: string) => boolean;
  onFavorite: (champion: string, skin: string) => void;
  patcherActive: boolean;
  selection: Selection;
  onSelectionChange: (selection: Selection) => void;
  onDelete: (championName: string, skinName: string) => Promise<void>;
}

function SkinThumb({ champion, name }: { champion: string; name: string }) {
  const owner = findChampionByName(champion);
  const num = lookupSplashNum(name);
  return owner && num !== null ? (
    <SkinPortrait championId={owner.id} skinNum={num} alt={name} />
  ) : (
    <span className="skin-portrait-placeholder">
      <Layers size={24} />
    </span>
  );
}

function ChampionAvatar({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const champion = findChampionByName(name);
  return champion && !failed ? (
    <img
      className="deck-champion-avatar"
      src={championAvatar(champion.id)}
      alt=""
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="deck-avatar-fallback">{name[0]}</span>
  );
}

function ChampionSkinDeck({
  deck,
  selected,
  disabled,
  isFavorite,
  onFavorite,
  onChoose,
  onDelete,
}: {
  deck: ChampionDeck;
  selected?: string;
  disabled: boolean;
  isFavorite: (name: string) => boolean;
  onFavorite: (name: string) => void;
  onChoose: (name: string, enabled: boolean) => void;
  onDelete: (downloads: DownloadedSkin[]) => Promise<void>;
}) {
  const [lastFront, setLastFront] = useState("");
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [leaving, setLeaving] = useState<{ name: string; direction: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removePending, setRemovePending] = useState<"one" | "group" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = useRef(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const frontIndex = deckFrontIndex(deck.groups, selected, lastFront);
  const front = deck.groups[frontIndex];
  const current = deckVariant(front, selected ?? variants[front.name]);
  const active = current.skin_name === selected;
  const busy = disabled || deleting || !!leaving;
  const variantCount = groupDownloads(front).length;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  function chooseGroup(index: number, direction = 1) {
    if (busy || locked.current) return;
    const next = deck.groups[index];
    if (!next) return;
    const download = deckVariant(next, variants[next.name]);
    if (next.name !== front.name) {
      locked.current = true;
      setLeaving({ name: front.name, direction });
      timer.current = setTimeout(() => {
        setLeaving(null);
        locked.current = false;
        timer.current = null;
      }, 300);
    }
    setLastFront(next.name);
    setVariants((value) => ({
      ...value,
      [front.name]: current.skin_name,
      [next.name]: download.skin_name,
    }));
    onChoose(download.skin_name, true);
  }
  function cycle(direction: number) {
    if (deck.groups.length > 1)
      chooseGroup(deckTarget(frontIndex, deck.groups.length, direction), direction);
  }
  function chooseVariant(name: string) {
    if (busy || locked.current) return;
    setLastFront(front.name);
    setVariants((value) => ({ ...value, [front.name]: name }));
    onChoose(name, name !== selected);
  }
  async function remove() {
    if (!removePending || busy) return;
    const downloads = removePending === "group" ? groupDownloads(front) : [current];
    setDeleting(true);
    setError(null);
    try {
      await onDelete(downloads);
      setRemovePending(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleting(false);
    }
  }
  return (
    <article
      className={`champion-skin-deck ${active ? "has-selection" : ""}`}
      tabIndex={0}
      aria-label={`${deck.champion} installed skins`}
      onKeyDown={(event) => {
        if (
          event.altKey ||
          event.metaKey ||
          event.ctrlKey ||
          menu.current?.contains(event.target as Node)
        )
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          cycle(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <header className="skin-deck-heading">
        <ChampionAvatar name={deck.champion} />
        <div>
          <h2>{deck.champion}</h2>
          <span>
            {deck.groups.length} {deck.groups.length === 1 ? "skin" : "skins"}
          </span>
        </div>
        <details className="skin-deck-menu" ref={menu}>
          <summary aria-label={`Manage ${deck.champion} downloads`}>
            <MoreHorizontal size={17} />
          </summary>
          <div>
            <button
              disabled={busy}
              onClick={() => {
                setRemovePending("one");
                if (menu.current) menu.current.open = false;
              }}
            >
              <Trash2 size={12} />
              Remove this {current.skin_name === front.name ? "skin" : "chroma"}
            </button>
            {variantCount > 1 && (
              <button
                disabled={busy}
                onClick={() => {
                  setRemovePending("group");
                  if (menu.current) menu.current.open = false;
                }}
              >
                <Trash2 size={12} />
                Remove skin & chromas
              </button>
            )}
          </div>
        </details>
      </header>
      <div className="skin-deck-stack" role="group" aria-label={`${deck.champion} skin cards`}>
        {deck.groups.map((group, index) => {
          const depth = deckTarget(index, deck.groups.length, -frontIndex);
          const departing = leaving?.name === group.name;
          if (depth > 2 && !departing) return null;
          const download = deckVariant(
            group,
            depth === 0 ? current.skin_name : variants[group.name]
          );
          return (
            <button
              key={group.name}
              className={`skin-deck-card ${depth === 0 ? "front" : ""} ${departing ? `departing ${leaving.direction < 0 ? "to-right" : "to-left"}` : ""}`}
              style={
                {
                  "--deck-depth": Math.min(depth, 3),
                  zIndex: departing ? 5 : 4 - depth,
                } as CSSProperties
              }
              aria-label={`${depth === 0 && active ? "Disable" : "Select"} ${download.skin_name}`}
              title={download.skin_name}
              aria-pressed={selected === download.skin_name}
              tabIndex={depth === 0 ? 0 : -1}
              disabled={busy}
              onClick={() =>
                depth === 0 ? chooseVariant(current.skin_name) : chooseGroup(index, 1)
              }
            >
              <SkinThumb champion={deck.champion} name={group.name} />
              <span className="skin-deck-art-shade" />
              {depth === 0 && active && (
                <span className="skin-deck-selected">
                  <Check size={12} />
                </span>
              )}
              {depth === 0 && current.skin_name !== front.name && (
                <span className="skin-deck-chroma-badge">
                  {front.chromas.find((c) => c.download.skin_name === current.skin_name)?.image
                    ? "Form"
                    : "Chroma"}
                </span>
              )}
            </button>
          );
        })}
        <button
          className={`star-button skin-deck-favorite ${isFavorite(current.skin_name) ? "starred" : ""}`}
          aria-label={`${isFavorite(current.skin_name) ? "Unfavorite" : "Favorite"} ${current.skin_name}`}
          aria-pressed={isFavorite(current.skin_name)}
          onClick={() => onFavorite(current.skin_name)}
        >
          <Star size={13} fill={isFavorite(current.skin_name) ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="skin-deck-caption">
        <button
          className="deck-cycle"
          disabled={busy || deck.groups.length < 2}
          aria-label={`Previous ${deck.champion} skin`}
          onClick={() => cycle(-1)}
        >
          <SystemIcon name="back" fallback={ChevronLeft} size={14} />
        </button>
        <div aria-live="polite">
          <h3 title={current.skin_name}>{current.skin_name}</h3>
          <span>
            {frontIndex + 1} / {deck.groups.length}
            {active ? " · Selected" : ""}
          </span>
        </div>
        <button
          className="deck-cycle"
          disabled={busy || deck.groups.length < 2}
          aria-label={`Next ${deck.champion} skin`}
          onClick={() => cycle(1)}
        >
          <SystemIcon name="next" fallback={ChevronRight} size={14} />
        </button>
      </div>
      {front.chromas.length > 0 && (
        <div
          className="skin-deck-chromas"
          role="group"
          aria-label={`Downloaded ${front.name} variants`}
        >
          {front.base && (
            <button
              className={`deck-base-swatch ${current.skin_name === front.base.skin_name ? "current" : ""}`}
              title={front.name}
              aria-label={`Select base ${front.name}`}
              aria-pressed={selected === front.base.skin_name}
              disabled={busy}
              onClick={() => chooseVariant(front.base!.skin_name)}
            >
              <span />
            </button>
          )}
          {front.chromas.map((chroma) => (
            <button
              key={chroma.download.skin_name}
              title={chroma.download.skin_name}
              aria-label={`Select ${chroma.download.skin_name}`}
              aria-pressed={selected === chroma.download.skin_name}
              disabled={busy}
              className={current.skin_name === chroma.download.skin_name ? "current" : ""}
              style={{
                background: chroma.image
                  ? `center 12% / cover no-repeat url("${chroma.image}"), var(--material-fill)`
                  : chroma.colors.length > 1
                    ? `linear-gradient(135deg,${chroma.colors[0]} 50%,${chroma.colors[1]} 50%)`
                    : (chroma.colors[0] ?? "var(--accent)"),
              }}
              onClick={() => chooseVariant(chroma.download.skin_name)}
            >
              {selected === chroma.download.skin_name && <Check size={9} />}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="deck-error">
          {error}
        </p>
      )}
      {removePending && (
        <div className="deck-delete-confirm">
          <Trash2 size={22} />
          <h3>Remove {removePending === "group" ? "skin and chromas" : "this download"}?</h3>
          <p>{current.skin_name}</p>
          <div>
            <button
              className="quiet-button"
              disabled={deleting}
              onClick={() => setRemovePending(null)}
            >
              Cancel
            </button>
            <button className="danger-button" disabled={deleting} onClick={() => void remove()}>
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Remove
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function MySkins({
  downloads,
  isFavorite,
  onFavorite,
  patcherActive,
  selection,
  onSelectionChange,
  onDelete,
}: MySkinsProps) {
  const [metadataReady, setMetadataReady] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let live = true;
    // The catalog tree is what tells Ultimate skin forms apart from separate skins.
    void Promise.all([ensureSkinIds(), ensureChromaInfo(), ensureRepoZips()])
      .then(() => {
        if (live) setMetadataReady(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const decks = useMemo(() => {
    void metadataReady;
    return groupLibrarySkins(downloads, lookupChromaInfo);
  }, [downloads, metadataReady]);
  const query = search.trim().toLowerCase();
  const filtered = decks.filter((deck) =>
    `${deck.champion} ${deck.groups.flatMap((group) => groupDownloads(group).map((download) => download.skin_name)).join(" ")}`
      .toLowerCase()
      .includes(query)
  );
  const selectedCount = decks.filter((deck) =>
    deck.groups.some((group) =>
      groupDownloads(group).some((download) => download.skin_name === selection[deck.champion])
    )
  ).length;
  function choose(champion: string, name: string, enabled: boolean) {
    if (patcherActive) return;
    const next = { ...selection };
    if (enabled) next[champion] = name;
    else if (next[champion] === name) delete next[champion];
    onSelectionChange(next);
  }
  async function remove(champion: string, items: DownloadedSkin[]) {
    if (patcherActive) return;
    for (const item of items) {
      await onDelete(item.champion_name, item.skin_name);
      if (selection[champion] !== item.skin_name) continue;
      const next = { ...selection };
      delete next[champion];
      onSelectionChange(next);
    }
  }
  return (
    <div className="library-decks-view">
      <div className="library-decks-toolbar">
        <span className="collection-count">
          {decks.length} {decks.length === 1 ? "champion" : "champions"}
          <span className="library-total-skins">
            {" "}
            · {decks.reduce((total, deck) => total + deck.groups.length, 0)} skins
          </span>
        </span>
        <div className="search-field">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search library"
            aria-label="Search installed champions and skins"
          />
          {search && (
            <button aria-label="Clear search" onClick={() => setSearch("")}>
              <X size={13} />
            </button>
          )}
        </div>
        {selectedCount > 0 && (
          <span className="library-selection-count">{selectedCount} selected</span>
        )}
      </div>
      <div className="library-decks-scroll">
        {!decks.length ? (
          <div className="minimal-empty">
            <Layers size={30} />
            <h2>No downloaded skins</h2>
          </div>
        ) : !filtered.length ? (
          <div className="minimal-empty">
            <Search size={26} />
            <h2>No matches</h2>
          </div>
        ) : (
          <div className="library-decks-grid">
            {filtered.map((deck) => (
              <ChampionSkinDeck
                key={deck.champion}
                deck={deck}
                selected={selection[deck.champion]}
                disabled={patcherActive}
                isFavorite={(name) => isFavorite(deck.champion, name)}
                onFavorite={(name) => onFavorite(deck.champion, name)}
                onChoose={(name, enabled) => choose(deck.champion, name, enabled)}
                onDelete={(items) => remove(deck.champion, items)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
