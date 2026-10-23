import type { Champion } from "../types";
export type ChampionSort = "name-asc" | "name-desc" | "release-newest" | "release-oldest";
export type ReleaseDates = Record<string, string>;
export const SORT_OPTIONS: { value: ChampionSort; label: string }[] = [
  { value: "name-asc", label: "Alphabetical · A–Z" },
  { value: "name-desc", label: "Alphabetical · Z–A" },
  { value: "release-newest", label: "Release · Newest first" },
  { value: "release-oldest", label: "Release · Oldest first" },
];
export function isChampionSort(value: unknown): value is ChampionSort {
  return SORT_OPTIONS.some((option) => option.value === value);
}
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
export function championReleaseDate(champion: Champion, dates: ReleaseDates): string | null {
  const date = dates[key(champion.id)] ?? dates[key(champion.name)];
  return date &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
    ? date
    : null;
}
export function sortChampions(
  champions: Champion[],
  sort: ChampionSort,
  dates: ReleaseDates
): Champion[] {
  return [...champions].sort((a, b) => {
    const alphabetical = a.name.localeCompare(b.name, "en");
    if (sort === "name-asc") return alphabetical;
    if (sort === "name-desc") return -alphabetical;
    const first = championReleaseDate(a, dates),
      second = championReleaseDate(b, dates);
    if (!first || !second) return first ? -1 : second ? 1 : alphabetical;
    return (
      (sort === "release-newest" ? second.localeCompare(first) : first.localeCompare(second)) ||
      alphabetical
    );
  });
}
