import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getPatcherHealth } from "../lib/commands";
import type { HealthCheck, PatcherStatus } from "../types";
export function usePatcherHealth(paths: string[], gamePath: string | null, status: PatcherStatus) {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const signature = JSON.stringify(paths);
  const statusKey = JSON.stringify(status);
  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    const request = ++sequence.current;
    setChecking(true);
    setError(null);
    try {
      const next = await getPatcherHealth(JSON.parse(signature));
      if (request === sequence.current) setChecks(next);
    } catch (e) {
      if (request === sequence.current) setError(String(e));
    } finally {
      if (request === sequence.current) setChecking(false);
    }
  }, [signature, gamePath, statusKey]);
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  return { checks, checking, error, refresh };
}
export type PatcherHealth = ReturnType<typeof usePatcherHealth>;
