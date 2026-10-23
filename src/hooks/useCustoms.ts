import { useState, useEffect, useCallback } from "react";
import { importCustom, listCustoms, removeCustom } from "../lib/commands";
import type { CustomMod } from "../types";

export function useCustoms() {
  const [customs, setCustoms] = useState<CustomMod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setCustoms((await listCustoms()).map(e => ({ ...e, enabled: false }))); }
    catch (e) { setError(String(e)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const addCustom = useCallback(async (srcPath: string) => {
    setError(null);
    const name = (srcPath.split("/").pop() ?? srcPath).replace(/\.(zip|fantome)$/i, "");
    const entry = { ...await importCustom(srcPath, name), enabled: false };
    setCustoms(prev => [...prev.filter(c => c.name !== entry.name), entry].sort((a,b) => a.name.localeCompare(b.name)));
    return entry;
  }, []);
  const remove = useCallback(async (name: string) => {
    await removeCustom(name);
    setCustoms(prev => prev.filter(c => c.name !== name));
  }, []);
  return { customs, addCustom, remove, refresh, error, clearError: useCallback(() => setError(null), []) };
}
