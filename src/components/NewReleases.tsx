import { useState } from "react";
import { ArrowUpRight, CheckCircle2, ImageOff, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { usePatchSkins } from "../hooks/usePatchSkins";
import { splashUrl } from "../hooks/useChampions";
import { patchLabel } from "../lib/patchSkins";
import SystemIcon from "./SystemIcon";
import type { Champion, Skin } from "../types";

function Splash({ skin }: { skin: Skin }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="patch-art-placeholder">
      <ImageOff size={28} />
    </div>
  ) : (
    <img
      src={splashUrl(skin.championId, skin.num)}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
export default function NewReleases({
  onSelect,
  isDownloaded,
}: {
  onSelect: (champion: Champion, skin: Skin) => void;
  isDownloaded: (champion: string, skin: string) => boolean;
}) {
  const { data, refreshing, error, refresh } = usePatchSkins();
  return (
    <div className="new-releases-scroll">
      <header className="patch-heading">
        <div>
          <h1>New Releases</h1>
          {data && (
            <p>
              <span className="patch-version">Patch {patchLabel(data.version)}</span>
              <span>
                {data.skins.length} new {data.skins.length === 1 ? "skin" : "skins"}
              </span>
            </p>
          )}
        </div>
        <button
          className="icon-button"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh current patch"
          title="Refresh current patch"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </header>
      {!data ? (
        <div className="catalog-empty">
          {error ? (
            <>
              <ImageOff size={27} />
              <h3>Couldn’t load this patch</h3>
              <button className="primary-button" onClick={refresh}>
                Try again
              </button>
            </>
          ) : (
            <>
              <Loader2 size={25} className="animate-spin" />
              <p>Checking the latest patch…</p>
            </>
          )}
        </div>
      ) : (
        <>
          {error && (
            <div className="patch-refresh-error" role="status">
              Couldn’t refresh. Showing the saved patch.
            </div>
          )}
          {data.skins.length > 0 ? (
            <div className="patch-skin-grid">
              {data.skins.map(({ champion, skin }) => (
                <button
                  className="patch-skin-card"
                  key={skin.id}
                  onClick={() => onSelect(champion, skin)}
                  aria-label={`View ${skin.name}`}
                >
                  <div className="patch-skin-art">
                    <Splash skin={skin} />
                    <div className="patch-skin-shade" />
                    <span className="patch-new-badge">New</span>
                    {isDownloaded(skin.championName, skin.name) && (
                      <span className="patch-downloaded" title="Downloaded" aria-label="Downloaded">
                        <SystemIcon name="enabled" fallback={CheckCircle2} size={18} />
                      </span>
                    )}
                    <span className="patch-open">
                      <ArrowUpRight size={18} />
                    </span>
                  </div>
                  <div className="patch-skin-label">
                    <span>{champion.name}</span>
                    <h2>{skin.name}</h2>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="catalog-empty">
              <Sparkles size={27} />
              <h3>No new skins this patch</h3>
            </div>
          )}
        </>
      )}
    </div>
  );
}
