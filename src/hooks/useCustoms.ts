import { useState, useEffect, useCallback } from "react";
import { importCustom, listCustoms, removeCustom, setCustomKind } from "../lib/commands";
import { modFileName } from "../lib/mods";
import type { CustomMod, ModKind } from "../types";

export function useCustoms() {
  const [customs, setCustoms] = useState<CustomMod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setCustoms((await listCustoms()).map((e) => ({ ...e, enabled: false })));
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const addCustom = useCallback(async (srcPath: string, kind?: ModKind) => {
    setError(null);
    const name = modFileName(srcPath);
    const entry = { ...(await importCustom(srcPath, name, kind)), enabled: false };
    setCustoms((prev) =>
      [...prev.filter((c) => c.name !== entry.name), entry].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    return entry;
  }, []);
  const setKind = useCallback(async (name: string, kind: ModKind) => {
    await setCustomKind(name, kind);
    setCustoms((prev) => prev.map((mod) => (mod.name === name ? { ...mod, kind } : mod)));
  }, []);
  const remove = useCallback(async (name: string) => {
    await removeCustom(name);
    setCustoms((prev) => prev.filter((c) => c.name !== name));
  }, []);
  return {
    customs,
    addCustom,
    setKind,
    remove,
    refresh,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
