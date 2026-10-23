import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NavigationPreferences, TabId } from "../lib/navigation";
import SystemIcon from "./SystemIcon";

export interface SidebarItem {
  id: TabId;
  label: string;
  icon: LucideIcon;
  symbol: string;
}
export default function SidebarSettings({
  items,
  preferences,
  onMove,
  onToggle,
  onReset,
}: {
  items: SidebarItem[];
  preferences: NavigationPreferences;
  onMove: (id: TabId, index: number) => void;
  onToggle: (id: TabId) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState<TabId | null>(null);
  const rows = useRef(new Map<TabId, HTMLDivElement>());
  const current = useRef({ preferences, onMove });
  current.current = { preferences, onMove };
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const others = current.current.preferences.order.filter((id) => id !== dragging);
      const index = others.filter((id) => {
        const rect = rows.current.get(id)?.getBoundingClientRect();
        return !!rect && event.clientY > rect.top + rect.height / 2;
      }).length;
      if (current.current.preferences.order.indexOf(dragging) !== index)
        current.current.onMove(dragging, index);
    };
    const end = () => setDragging(null);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") end();
    };
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.userSelect = previous;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
      window.removeEventListener("keydown", key);
    };
  }, [dragging]);
  return (
    <section className="sidebar-settings" aria-label="Customize sidebar">
      <div className="sidebar-settings-heading">
        <div>
          <h2>Sidebar</h2>
          <p>Show your tabs. Put them in your order.</p>
        </div>
        <button className="quiet-button" onClick={onReset}>
          <RotateCcw size={12} />
          Reset
        </button>
      </div>
      <div className="sidebar-settings-list">
        {preferences.order.map((id, index) => {
          const item = items.find((item) => item.id === id);
          if (!item) return null;
          const hidden = preferences.hidden.includes(id);
          return (
            <div
              className={`sidebar-setting-row ${dragging === id ? "dragging" : ""} ${hidden ? "hidden-tab" : ""}`}
              key={id}
              ref={(node) => {
                if (node) rows.current.set(id, node);
                else rows.current.delete(id);
              }}
              data-view={id}
            >
              <button
                className="tab-drag-handle"
                aria-label={`Move ${item.label}. Use the up and down arrow keys to reorder.`}
                title="Drag to reorder"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  setDragging(id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    onMove(id, index + (event.key === "ArrowUp" ? -1 : 1));
                  }
                }}
              >
                <GripVertical size={15} />
              </button>
              <span className="sidebar-setting-icon">
                <SystemIcon name={item.symbol} fallback={item.icon} size={17} />
              </span>
              <span className="sidebar-setting-label">
                {item.label}
                {id === "settings" && <small>Always visible</small>}
              </span>
              <div className="tab-order-buttons">
                <button
                  disabled={index === 0}
                  aria-label={`Move ${item.label} up`}
                  onClick={() => onMove(id, index - 1)}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  disabled={index === preferences.order.length - 1}
                  aria-label={`Move ${item.label} down`}
                  onClick={() => onMove(id, index + 1)}
                >
                  <ArrowDown size={12} />
                </button>
              </div>
              <button
                className={`setting-switch ${!hidden ? "on" : ""}`}
                disabled={id === "settings"}
                role="switch"
                aria-checked={!hidden}
                aria-label={`Show ${item.label}`}
                onClick={() => onToggle(id)}
              >
                <span />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
