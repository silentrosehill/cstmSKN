import { getItem, setItem, readStored, stringList } from "../lib/storage";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Star,
  ArrowUpRight,
  SlidersHorizontal,
  ArrowDownUp,
  ChevronDown,
  X,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { useChampions, splashUrl } from "../hooks/useChampions";
import { getSplashNum } from "../hooks/useSkinData";
import { useSkinSearch } from "../hooks/useSkinSearch";
import { useReleaseDates } from "../hooks/useReleaseDates";
import {
  sortChampions,
  championReleaseDate,
  isChampionSort,
  SORT_OPTIONS,
  type ChampionSort,
} from "../lib/championSort";
import { letterSections, matchesSearch, searchSkins } from "../lib/championSearch";
import SystemIcon from "./SystemIcon";
import type { Champion } from "../types";

const releaseFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

interface Props {
  onSelect: (champion: Champion, skinId?: string) => void;
  search: string;
  onSearchChange: (query: string) => void;
}

export default function ChampionGrid({ onSelect, search, onSearchChange }: Props) {
  const { champions, total, loading, error } = useChampions();
  const skins = useSkinSearch(champions);
  const dates = useReleaseDates();
  const scroll = useRef<HTMLDivElement>(null);
  const sections = useRef(new Map<string, HTMLElement>());
  const [sort, setSort] = useState<ChampionSort>(() => {
    const value = getItem("cstm:champion-sort");
    return isChampionSort(value) ? value : "name-asc";
  });
  useEffect(() => {
    setItem("cstm:champion-sort", sort);
  }, [sort]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => {
    return stringList(readStored("glass:favorites", []));
  });
  const [compact, setCompact] = useState(false);
  const [skinLimit, setSkinLimit] = useState(48);
  const searching = !!search.trim();
  const alphabetical = sort.startsWith("name-");
  useEffect(() => {
    setSkinLimit(48);
    scroll.current?.scrollTo({ top: 0 });
  }, [search, onlyFavorites, sort]);
  const eligible = useMemo(
    () => champions.filter((champion) => !onlyFavorites || favorites.includes(champion.id)),
    [champions, onlyFavorites, favorites]
  );
  const list = useMemo(
    () =>
      sortChampions(
        eligible.filter((champion) => matchesSearch(champion.name, search)),
        sort,
        dates
      ),
    [eligible, search, sort, dates]
  );
  const letters = useMemo(() => letterSections(list), [list]);
  const matches = useMemo(() => {
    const ids = new Set(eligible.map((champion) => champion.id));
    return searchSkins(skins.index, search).filter((entry) => ids.has(entry.champion.id));
  }, [skins.index, search, eligible]);
  const availableLetters = new Set(letters.map((section) => section.letter));

  function favorite(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id];
      setItem("glass:favorites", JSON.stringify(next));
      return next;
    });
  }

  function championCard(champion: Champion) {
    const releaseDate = championReleaseDate(champion, dates);
    return (
      <article className="champion-card" key={champion.id}>
        <button
          className="champion-open"
          onClick={() => onSelect(champion)}
          aria-label={`Explore ${champion.name} skins`}
        >
          <img src={splashUrl(champion.id, 0)} alt="" loading="lazy" draggable={false} />
          <div className="champion-gradient" />
          <div className="champion-label">
            <h3>{champion.name}</h3>
            <span>
              {!alphabetical && releaseDate ? (
                <time dateTime={releaseDate}>
                  {releaseFormat.format(new Date(`${releaseDate}T00:00:00Z`))}
                </time>
              ) : (
                champion.title
              )}
            </span>
          </div>
          <span className="card-arrow">
            <ArrowUpRight size={16} />
          </span>
        </button>
        <button
          className={`favorite-button ${favorites.includes(champion.id) ? "is-favorite" : ""}`}
          aria-label={`${favorites.includes(champion.id) ? "Unfavorite" : "Favorite"} ${champion.name}`}
          aria-pressed={favorites.includes(champion.id)}
          onClick={() => favorite(champion.id)}
        >
          <Star size={14} fill={favorites.includes(champion.id) ? "currentColor" : "none"} />
        </button>
      </article>
    );
  }

  const noMatches =
    !loading &&
    !error &&
    list.length === 0 &&
    (!searching || (!skins.loading && matches.length === 0 && !skins.error));
  return (
    <div className="discover-scroll" ref={scroll}>
      <section className="champion-section">
        <div className="section-title">
          <div>
            <h1>
              Champions <span>{total || "—"}</span>
            </h1>
          </div>
          <div className="catalog-actions">
            <label className="sort-control" title="Sort champions">
              <SystemIcon name="sort" fallback={ArrowDownUp} size={15} />
              <select
                aria-label="Sort champions"
                value={sort}
                onChange={(event) => {
                  if (isChampionSort(event.target.value)) setSort(event.target.value);
                }}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <SystemIcon name="chevron-down" fallback={ChevronDown} size={10} />
            </label>
            <button
              className={onlyFavorites ? "icon-button selected" : "icon-button"}
              onClick={() => setOnlyFavorites(!onlyFavorites)}
              aria-label="Show favorite champions"
              aria-pressed={onlyFavorites}
            >
              <SystemIcon name="star" fallback={Star} size={17} />
            </button>
            <button
              className="icon-button"
              aria-label={compact ? "Use spacious grid" : "Use compact grid"}
              aria-pressed={compact}
              onClick={() => setCompact(!compact)}
            >
              <SystemIcon name="compact" fallback={SlidersHorizontal} size={17} />
            </button>
          </div>
        </div>
        <div className="catalog-toolbar">
          <div className="search-field">
            <SystemIcon name="search" fallback={Search} size={16} />
            <input
              aria-label="Search champions and skins"
              placeholder="Search champions & skins…"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            {search && (
              <button aria-label="Clear search" onClick={() => onSearchChange("")}>
                <SystemIcon name="close" fallback={X} size={13} />
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="champion-cards">
            {Array.from({ length: 12 }, (_, i) => (
              <div className="champion-skeleton" key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="catalog-empty">
            <p>Champion data couldn’t load.</p>
            <small>{error}</small>
            <button className="primary-button" onClick={() => window.location.reload()}>
              <RotateCcw size={14} /> Try again
            </button>
          </div>
        ) : (
          <>
            {alphabetical && list.length > 0 && (
              <nav className="alphabet-index" aria-label="Jump to champion letter">
                {(sort === "name-desc" ? [...ALPHABET].reverse() : ALPHABET).map((letter) => (
                  <button
                    key={letter}
                    disabled={!availableLetters.has(letter)}
                    aria-label={`Jump to ${letter}`}
                    onClick={() =>
                      sections.current.get(letter)?.scrollIntoView({
                        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                          ? "instant"
                          : "smooth",
                        block: "start",
                      })
                    }
                  >
                    {letter}
                  </button>
                ))}
              </nav>
            )}
            {searching && list.length > 0 && (
              <h2 className="search-results-heading">
                Champions <span>{list.length}</span>
              </h2>
            )}
            {alphabetical
              ? letters.map((section) => (
                  <section
                    className="champion-letter-section"
                    key={section.letter}
                    aria-label={`${section.letter} champions`}
                    ref={(element) => {
                      if (element) sections.current.set(section.letter, element);
                      else sections.current.delete(section.letter);
                    }}
                  >
                    <div className="champion-letter-heading">
                      <h2>{section.letter}</h2>
                      <span>{section.champions.length}</span>
                      <i />
                    </div>
                    <div className={`champion-cards ${compact ? "compact" : ""}`}>
                      {section.champions.map(championCard)}
                    </div>
                  </section>
                ))
              : list.length > 0 && (
                  <div className={`champion-cards ${compact ? "compact" : ""}`}>
                    {list.map(championCard)}
                  </div>
                )}
            {searching && (
              <section className="skin-search-results" aria-label="Matching skins">
                <h2 className="search-results-heading">
                  Skins <span>{matches.length || (skins.loading ? "" : "0")}</span>
                </h2>
                {skins.loading ? (
                  <div className="search-status" role="status">
                    <Loader2 size={17} className="animate-spin" />
                    Searching skins…
                  </div>
                ) : skins.error ? (
                  <div className="search-status" role="status">
                    Skin search couldn’t load.<button onClick={skins.retry}>Try again</button>
                  </div>
                ) : matches.length > 0 ? (
                  <>
                    <div className={`skin-search-cards ${compact ? "compact" : ""}`}>
                      {matches.slice(0, skinLimit).map(({ champion, skin }) => (
                        <button
                          className="skin-search-card"
                          key={skin.id}
                          onClick={() => onSelect(champion, skin.id)}
                          aria-label={`View ${skin.name}`}
                        >
                          <div className="skin-search-art">
                            <img
                              src={splashUrl(champion.id, getSplashNum(skin))}
                              alt=""
                              loading="lazy"
                              draggable={false}
                            />
                            <span className="card-arrow">
                              <ArrowUpRight size={16} />
                            </span>
                          </div>
                          <div className="skin-search-label">
                            <strong>{skin.name}</strong>
                            <span>{champion.name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                    {matches.length > skinLimit && (
                      <button
                        className="search-show-more"
                        onClick={() => setSkinLimit((limit) => limit + 48)}
                      >
                        Show more <ChevronDown size={13} />
                      </button>
                    )}
                  </>
                ) : (
                  list.length > 0 && <p className="search-status">No matching skins.</p>
                )}
              </section>
            )}
            {noMatches && (
              <div className="catalog-empty">
                <Search size={26} />
                <h3>No matches</h3>
                {onlyFavorites && <p>No favorites match this filter.</p>}
                <button
                  className="primary-button"
                  onClick={() => {
                    onSearchChange("");
                    setOnlyFavorites(false);
                  }}
                >
                  Show all champions
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
