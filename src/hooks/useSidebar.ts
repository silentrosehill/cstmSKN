import { getItem, setItem } from "../lib/storage";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { sidebarWidth, SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX } from "../lib/layout";
export function useSidebar() {
  const [width, setWidth] = useState(() =>
    sidebarWidth(Number(getItem("cstm:sidebar-width") ?? SIDEBAR_DEFAULT))
  );
  const [resizing, setResizing] = useState(false);
  const expanded = useRef(Number(getItem("cstm:sidebar-expanded")) || SIDEBAR_DEFAULT);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const collapsed = width === SIDEBAR_MIN;
  useEffect(() => {
    const timer = setTimeout(() => {
      setItem("cstm:sidebar-width", String(width));
      if (width > SIDEBAR_MIN) {
        expanded.current = width;
        setItem("cstm:sidebar-expanded", String(width));
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [width]);
  const toggle = () =>
    setWidth((current) => {
      if (current === SIDEBAR_MIN) return sidebarWidth(Math.max(expanded.current, 180));
      expanded.current = current;
      setItem("cstm:sidebar-expanded", String(current));
      return SIDEBAR_MIN;
    });
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width };
    setResizing(true);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (drag.current) setWidth(sidebarWidth(drag.current.width + e.clientX - drag.current.x));
  }
  function finish(e: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    setResizing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Enter") {
      toggle();
      return;
    }
    setWidth((current) =>
      e.key === "Home"
        ? SIDEBAR_MIN
        : e.key === "End"
          ? SIDEBAR_MAX
          : sidebarWidth(
              current === SIDEBAR_MIN && e.key === "ArrowRight"
                ? 152
                : current + (e.key === "ArrowRight" ? 16 : -16)
            )
    );
  }
  return {
    width,
    collapsed,
    resizing,
    toggle,
    separator: {
      role: "separator" as const,
      tabIndex: 0,
      "aria-label": "Resize sidebar",
      "aria-orientation": "vertical" as const,
      "aria-valuemin": SIDEBAR_MIN,
      "aria-valuemax": SIDEBAR_MAX,
      "aria-valuenow": width,
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: () => {
        drag.current = null;
        setResizing(false);
      },
      onKeyDown,
      onDoubleClick: toggle,
    },
  };
}
