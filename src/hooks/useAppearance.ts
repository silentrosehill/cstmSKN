import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getItem, setItem } from "../lib/storage";
import { tabAccent } from "../lib/tabAccent";
import type { TabId } from "../lib/navigation";

/** Light/dark theme and accent color: saved, applied to the page and to the native window. */
export function useAppearance(view: TabId, native: boolean) {
  const [theme, setTheme] = useState(() => getItem("glass:theme") ?? "dark");
  const [accent, setAccent] = useState(() => getItem("glass:accent") ?? "lavender");
  const [accentMode, setAccentMode] = useState(() => getItem("glass:accent-mode") ?? "tab");
  const effectiveAccent = tabAccent(view, accent, accentMode);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    setItem("glass:theme", theme);
    if (native)
      void getCurrentWebviewWindow()
        .setTheme(theme === "light" ? "light" : "dark")
        .catch(() => {});
  }, [theme, native]);
  useEffect(() => {
    document.documentElement.dataset.accent = effectiveAccent;
  }, [effectiveAccent]);
  useEffect(() => {
    setItem("glass:accent", accent);
  }, [accent]);
  useEffect(() => {
    setItem("glass:accent-mode", accentMode);
  }, [accentMode]);

  return { theme, setTheme, accent, setAccent, accentMode, setAccentMode };
}
