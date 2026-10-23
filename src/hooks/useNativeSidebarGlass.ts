import { useEffect, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
export function useNativeSidebarGlass(sidebar: RefObject<HTMLElement | null>, native: boolean) {
  useEffect(() => {
    if (!native || !sidebar.current) return;
    let active = true,
      frame = 0,
      lastWidth = -1,
      latestRequest = 0;
    const element = sidebar.current;
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = Math.round(element.getBoundingClientRect().width);
        if (width === lastWidth) return;
        lastWidth = width;
        const request = ++latestRequest;
        void invoke<boolean>("set_sidebar_glass", { width })
          .then((enabled) => {
            if (active && request === latestRequest)
              document.documentElement.dataset.nativeGlass = String(enabled);
          })
          .catch(() => {
            if (active && request === latestRequest)
              delete document.documentElement.dataset.nativeGlass;
          });
      });
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    schedule();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      delete document.documentElement.dataset.nativeGlass;
    };
  }, [sidebar, native]);
}
