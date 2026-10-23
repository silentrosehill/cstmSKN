import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getChampSelect } from "../lib/commands";
import { ChampionNavigationGate } from "../lib/collections";
import type { ChampSelectState } from "../types";

export function useChampSelect(enabled: boolean, blocked: boolean, onLocked: (id: number) => void) {
  const [status, setStatus] = useState<ChampSelectState["state"]>("offline");
  const current = useRef({ blocked, onLocked });
  current.current = { blocked, onLocked };
  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const gate = new ChampionNavigationGate();
    async function poll() {
      try {
        const selection = await getChampSelect();
        if (cancelled) return;
        setStatus(selection.state);
        const champion = gate.accept(selection, current.current.blocked);
        if (champion) current.current.onLocked(champion);
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
      if (!cancelled) timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled]);
  return status;
}
