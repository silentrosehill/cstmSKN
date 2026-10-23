import { useCallback, useState } from "react";
import {
  sanitizeFavorites,
  type Favorites,
  type SavedLoadout,
  sanitizeLoadout,
} from "../lib/collections";
import type { Skin } from "../types";

export function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorites>(() =>
    sanitizeFavorites(readStored("cstm:favorites", {}))
  );
  const update = useCallback(
    (fn: (value: Favorites) => Favorites) =>
      setFavorites((value) => {
        const next = fn(value);
        localStorage.setItem("cstm:favorites", JSON.stringify(next));
        return next;
      }),
    []
  );
  const toggleSkin = useCallback(
    (skin: Skin) =>
      update((current) => ({
        ...current,
        skins: current.skins.some((s) => s.id === skin.id)
          ? current.skins.filter((s) => s.id !== skin.id)
          : [...current.skins, skin],
      })),
    [update]
  );
  const toggleCustom = useCallback(
    (name: string) =>
      update((current) => ({
        ...current,
        customs: current.customs.includes(name)
          ? current.customs.filter((n) => n !== name)
          : [...current.customs, name],
      })),
    [update]
  );
  return { favorites, toggleSkin, toggleCustom };
}
export function useSavedLoadouts() {
  const [saved, setSaved] = useState<SavedLoadout[]>(() => {
    const data = readStored<unknown>("cstm:saved-loadouts", []);
    return Array.isArray(data)
      ? data
          .filter(
            (item) =>
              item &&
              typeof item.id === "string" &&
              typeof item.name === "string" &&
              typeof item.savedAt === "string"
          )
          .map((item) => ({ ...item, selection: sanitizeLoadout(item.selection) }))
      : [];
  });
  const update = useCallback(
    (fn: (value: SavedLoadout[]) => SavedLoadout[]) =>
      setSaved((value) => {
        const next = fn(value);
        localStorage.setItem("cstm:saved-loadouts", JSON.stringify(next));
        return next;
      }),
    []
  );
  return { saved, update };
}
