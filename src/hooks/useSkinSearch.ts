import { useEffect, useMemo, useState } from "react";
import { ensureSkinIds } from "./useSkinData";
import { buildSkinIndex } from "../lib/championSearch";
import type { Champion } from "../types";

export function useSkinSearch(champions: Champion[]) {
  const [ids, setIds] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    void ensureSkinIds()
      .then((data) => {
        if (active) setIds(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const index = useMemo(() => (ids ? buildSkinIndex(champions, ids) : []), [ids, champions]);
  return { index, loading: !ids && !error, error, retry: () => setAttempt((value) => value + 1) };
}
