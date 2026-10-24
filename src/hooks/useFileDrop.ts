import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * Files dropped anywhere on the window. `onDrop` always sees the latest render's values;
 * `dragging` is true while files hover over the window.
 */
export function useFileDrop(native: boolean, onDrop: (paths: string[]) => void) {
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onDrop);
  handler.current = onDrop;

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let lastDrop = "";
    let lastTime = 0;
    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          setDragging(false);
          // The webview can report the same drop twice; ignore the repeat.
          const key = JSON.stringify(event.payload.paths);
          const now = Date.now();
          if (key === lastDrop && now - lastTime < 1000) return;
          lastDrop = key;
          lastTime = now;
          handler.current(event.payload.paths);
        } else setDragging(event.payload.type !== "leave");
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [native]);

  return dragging;
}
