import { useState, useCallback, useRef, useEffect } from "react";
import { applySkins, stopPatcher as stopPatcherCmd, getPatcherStatus } from "../lib/commands";
import type { PatcherStatus } from "../types";

export function usePatcher() {
  const [status, setStatus] = useState<PatcherStatus>("Idle");
  const [error, setError] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const stopPolling = useCallback(() => { if (polling.current) clearInterval(polling.current); polling.current = null; }, []);
  useEffect(() => () => { generation.current++; stopPolling(); }, [stopPolling]);
  const apply = useCallback(async (paths: string[]) => {
    if (!paths.length) return;
    const request = ++generation.current;
    stopPolling(); setError(null); setStatus("Importing");
    try {
      await applySkins(paths);
      if (request !== generation.current) return;
      // Start polling only after native setup accepts the new generation.
      polling.current = setInterval(async () => {
        try {
          const next = await getPatcherStatus();
          if (request !== generation.current) return;
          setStatus(next);
          if (typeof next === "object" && "Error" in next) setError(next.Error);
          if (next === "Idle") stopPolling();
        } catch (e) { if (request === generation.current) setError(String(e)); }
      }, 500);
    } catch (e) {
      if (request === generation.current) { setError(String(e)); setStatus("Idle"); stopPolling(); }
    }
  }, [stopPolling]);
  const stop = useCallback(async () => {
    const request = ++generation.current;
    stopPolling();
    try {
      await stopPatcherCmd();
      if (request === generation.current) { setStatus("Idle"); setError(null); }
    } catch (e) { if (request === generation.current) setError(String(e)); }
  }, [stopPolling]);
  const isActive = status !== "Idle" && typeof status !== "object";
  return { status, error, apply, stop, isActive };
}
