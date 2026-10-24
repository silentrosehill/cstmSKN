import type { RefObject } from "react";
import {
  CircleCheck,
  ChevronRight,
  Image as ImageIcon,
  Maximize2,
  Moon,
  Package,
  PanelLeft,
  Sun,
  X,
} from "lucide-react";
import brandIcon from "../assets/icon.png";
import SystemIcon from "./SystemIcon";
import { championAvatar } from "../hooks/useChampions";
import type { useSidebar } from "../hooks/useSidebar";
import { modKind, modLabel } from "../lib/mods";
import type { NavItem } from "../lib/navItems";
import type { TabId } from "../lib/navigation";
import { customTargets, type ChampionAssignments } from "../lib/selection";
import type { Champion, CustomMod, DownloadedSkin } from "../types";

interface SidebarProps {
  element: RefObject<HTMLElement | null>;
  sidebar: ReturnType<typeof useSidebar>;
  blocked: boolean;
  items: NavItem[];
  view: TabId;
  onNav: (id: TabId) => void;
  downloadCount: number;
  customMods: CustomMod[];
  showEnabled: boolean;
  selectionCount: number;
  enabledDownloads: DownloadedSkin[];
  enabledMods: CustomMod[];
  champions: Champion[];
  assignments: ChampionAssignments;
  onOpenChampion: (champion: Champion) => void;
  onDisableSkin: (champion: string) => void;
  onToggleCustom: (mod: CustomMod) => void;
  theme: string;
  onThemeChange: (theme: string) => void;
}

/** Navigation, a short list of what's enabled, and the theme switch. */
export default function Sidebar({
  element,
  sidebar,
  blocked,
  items,
  view,
  onNav,
  downloadCount,
  customMods,
  showEnabled,
  selectionCount,
  enabledDownloads,
  enabledMods,
  champions,
  assignments,
  onOpenChampion,
  onDisableSkin,
  onToggleCustom,
  theme,
  onThemeChange,
}: SidebarProps) {
  // At most four enabled items fit; the rest are behind "View all".
  const shownDownloads = enabledDownloads.slice(0, 4);
  const shownMods = enabledMods.slice(0, Math.max(0, 4 - shownDownloads.length));
  const remaining = selectionCount - shownDownloads.length - shownMods.length;
  const customSkins = customMods.filter((m) => modKind(m) === "skin").length;
  const gameMods = customMods.length - customSkins;
  const openMod = (mod: CustomMod) => onNav(modKind(mod) === "skin" ? "customs" : "game-mods");

  return (
    <aside className="glass-sidebar" ref={element} inert={blocked}>
      <div className="brand">
        <img className="brand-app-icon" src={brandIcon} alt="cstmSKN icon" />
        <div className="brand-wordmark">
          <strong className="cstm-wordmark">
            cstm<span>SKN</span>
          </strong>
        </div>
        <button
          className="sidebar-toggle"
          onClick={sidebar.toggle}
          aria-label={sidebar.collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebar.collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <SystemIcon name="sidebar" fallback={PanelLeft} size={18} />
        </button>
      </div>
      <nav aria-label="Main navigation">
        {items.map(({ id, label, icon: Icon, symbol }) => (
          <button
            key={id}
            title={label}
            aria-label={label}
            aria-current={view === id ? "page" : undefined}
            onClick={() => onNav(id)}
            data-view={id}
            className={`nav-item ${view === id ? "active" : ""}`}
          >
            <span className="nav-symbol">
              <SystemIcon name={symbol} fallback={Icon} size={19} />
            </span>
            <span className="nav-label">{label}</span>
            {id === "my-skins" && downloadCount > 0 && <em>{downloadCount}</em>}
            {id === "customs" && customSkins > 0 && <em>{customSkins}</em>}
            {id === "game-mods" && gameMods > 0 && <em>{gameMods}</em>}
            {id === "enabled" && selectionCount > 0 && <em>{selectionCount}</em>}
          </button>
        ))}
      </nav>
      {showEnabled && (
        <section className="enabled-section" aria-label="Enabled skins">
          <button
            className="enabled-heading"
            onClick={() => onNav("enabled")}
            aria-label="Expand enabled skins"
            title="Open enabled skins"
          >
            <SystemIcon
              name="enabled"
              fallback={CircleCheck}
              size={18}
              className="enabled-heading-icon"
            />
            <span className="enabled-title">Enabled</span>
            <em>{selectionCount}</em>
            <SystemIcon
              name="expand"
              fallback={Maximize2}
              size={12}
              className="enabled-expand-icon"
            />
          </button>
          {selectionCount === 0 ? (
            <p className="enabled-empty-label">None</p>
          ) : (
            <div className="enabled-list">
              {shownDownloads.map((d) => {
                const champion = champions.find(
                  (c) => c.name === d.champion_name || c.id === d.champion_name
                );
                return (
                  <div className="enabled-item" key={d.zip_path}>
                    <button
                      className="enabled-open"
                      title={`${d.champion_name} · ${d.skin_name}`}
                      aria-label={`${d.champion_name} · ${d.skin_name}`}
                      onClick={() => {
                        if (champion) onOpenChampion(champion);
                      }}
                    >
                      {champion ? (
                        <img src={championAvatar(champion.id)} alt="" />
                      ) : (
                        <div className="enabled-custom-icon">
                          <ImageIcon size={14} />
                        </div>
                      )}
                      <span>
                        <strong>{champion?.name ?? d.champion_name}</strong>
                        <small>{d.skin_name}</small>
                      </span>
                    </button>
                    <button
                      className="enabled-remove"
                      aria-label={`Disable ${d.skin_name}`}
                      onClick={() => onDisableSkin(d.champion_name)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
              {shownMods.map((mod) => (
                <div className="enabled-item" key={mod.file_path}>
                  <button
                    className="enabled-open"
                    title={mod.name}
                    aria-label={mod.name}
                    onClick={() => openMod(mod)}
                  >
                    <div className="enabled-custom-icon">
                      <Package size={15} />
                    </div>
                    <span>
                      <strong>
                        {customTargets(mod, champions, assignments)
                          .map((id) => champions.find((c) => c.id.toLowerCase() === id)?.name ?? id)
                          .join(", ") || modLabel(mod)}
                      </strong>
                      <small>{mod.name}</small>
                    </span>
                  </button>
                  <button
                    className="enabled-remove"
                    aria-label={`Disable ${mod.name}`}
                    onClick={() => onToggleCustom(mod)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {remaining > 0 && (
            <button className="enabled-more" onClick={() => onNav("enabled")}>
              <span>View all {selectionCount}</span>
              <ChevronRight size={13} />
            </button>
          )}
        </section>
      )}
      <div className="sidebar-bottom">
        <div className="profile">
          <div className="profile-avatar">c</div>
          <strong>cstmSKN</strong>
          <button
            className="theme-button"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} appearance`}
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? (
              <SystemIcon name="sun" fallback={Sun} size={18} />
            ) : (
              <SystemIcon name="moon" fallback={Moon} size={18} />
            )}
          </button>
        </div>
      </div>
      <div className="sidebar-resizer" {...sidebar.separator} />
    </aside>
  );
}
