import { useEffect, useState } from "react";
import { getStale, setCache } from "../lib/cache";
import {
  newPatchSkins,
  patchVersions,
  type PatchHighlights,
  type RiotRoster,
} from "../lib/patchSkins";
const KEY = "cstm:patch-highlights-v1";
const CHECK_INTERVAL = 15 * 60 * 1000;
let pending: Promise<PatchHighlights> | null = null;
async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-cache", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Riot data unavailable (${response.status})`);
  return response.json();
}
function fetchHighlights(force = false): Promise<PatchHighlights> {
  if (pending) return pending;
  pending = (async () => {
    const versions = await json<string[]>("https://ddragon.leagueoflegends.com/api/versions.json");
    const { current, previous } = patchVersions(versions);
    const cached = getStale<PatchHighlights>(KEY);
    if (!force && cached?.version === current && cached.previousVersion === previous) return cached;
    const [latest, before] = await Promise.all(
      [current, previous].map((version) =>
        json<RiotRoster>(
          `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/championFull.json`
        )
      )
    );
    const result = {
      version: current,
      previousVersion: previous,
      skins: newPatchSkins(latest, before),
    };
    setCache(KEY, result);
    return result;
  })().finally(() => {
    pending = null;
  });
  return pending;
}
export function usePatchSkins() {
  const [data, setData] = useState<PatchHighlights | null>(() => getStale<PatchHighlights>(KEY));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true,
      lastCheck = 0;
    function refresh(force = false) {
      lastCheck = Date.now();
      setRefreshing(true);
      void fetchHighlights(force)
        .then((result) => {
          if (active) {
            setData(result);
            setError(false);
          }
        })
        .catch(() => {
          if (active) setError(true);
        })
        .finally(() => {
          if (active) setRefreshing(false);
        });
    }
    function onVisible() {
      if (document.visibilityState === "visible" && Date.now() - lastCheck >= CHECK_INTERVAL)
        refresh();
    }
    refresh(attempt > 0);
    const timer = window.setInterval(onVisible, CHECK_INTERVAL);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [attempt]);
  return { data, refreshing, error, refresh: () => setAttempt((value) => value + 1) };
}
