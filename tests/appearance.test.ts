import test from "node:test";
import assert from "node:assert/strict";
import { sidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX } from "../src/lib/layout.ts";
import { sortChampions, championReleaseDate } from "../src/lib/championSort.ts";
import {
  artworkTheme,
  contrast,
  paletteFromPixels,
  rgbToHsl,
  type RGB,
} from "../src/lib/artworkColors.ts";
import {
  buildSkinIndex,
  searchSkins,
  letterSections,
  matchesSearch,
  galleryTarget,
} from "../src/lib/championSearch.ts";
import type { Champion, SkinGroup } from "../src/types/index.ts";

const champion = (id: string, key: string, name = id): Champion => ({
  id,
  key,
  name,
  title: "",
  tags: [],
});
const roster = [
  champion("Ahri", "103"),
  champion("Aatrox", "266"),
  champion("MonkeyKing", "62", "Wukong"),
  champion("Unknown", "999"),
];
const dates = { ahri: "2011-12-14", aatrox: "2013-06-13", wukong: "2011-07-26" };
const rgb = (hex: string): RGB =>
  [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) as RGB;

test("sidebar snaps to icons and clamps both limits without accepting invalid storage", () => {
  assert.equal(sidebarWidth(120), SIDEBAR_MIN);
  assert.equal(sidebarWidth(-20), SIDEBAR_MIN);
  assert.equal(sidebarWidth(136), 136);
  assert.equal(sidebarWidth(225.7), 226);
  assert.equal(sidebarWidth(10000), SIDEBAR_MAX);
  assert.equal(sidebarWidth(NaN), 224);
});
test("release sorting uses dates, resolves display aliases, and keeps unknown dates last", () => {
  assert.deepEqual(
    sortChampions(roster, "release-newest", dates).map((c) => c.id),
    ["Aatrox", "Ahri", "MonkeyKing", "Unknown"]
  );
  assert.deepEqual(
    sortChampions(roster, "release-oldest", dates).map((c) => c.id),
    ["MonkeyKing", "Ahri", "Aatrox", "Unknown"]
  );
  assert.equal(roster[0].id, "Ahri");
  assert.equal(championReleaseDate(roster[2], dates), "2011-07-26");
  assert.equal(championReleaseDate(roster[0], { ahri: "2026-02-31" }), null);
});
test("alphabetical sections preserve ascending or descending order and never split one letter", () => {
  const ascending = letterSections(sortChampions(roster, "name-asc", dates));
  assert.deepEqual(
    ascending.map((section) => section.letter),
    ["A", "U", "W"]
  );
  assert.deepEqual(
    ascending[0].champions.map((c) => c.id),
    ["Aatrox", "Ahri"]
  );
  assert.deepEqual(
    letterSections(sortChampions(roster, "name-desc", dates)).map((section) => section.letter),
    ["W", "U", "A"]
  );
  assert.deepEqual(letterSections([]), []);
});
test("skin search finds skin lines, reordered words, and punctuation without default or unknown skins", () => {
  const index = buildSkinIndex(roster, {
    "103000": "Ahri",
    "103027": "K/DA Ahri",
    "103028": "K/DA Ahri (Ruby)",
    "103014": "Spirit Blossom Ahri",
    "62007": "Radiant Wukong",
    "888001": "Unknown skin",
    garbage: "bad",
  });
  assert.equal(index.length, 4);
  assert.equal(searchSkins(index, "kda")[0].skin.id, "103027");
  assert.equal(searchSkins(index, "ahri spirit")[0].skin.id, "103014");
  assert.equal(searchSkins(index, "ruby")[0].skin.id, "103028");
  assert.equal(searchSkins(index, "radiant")[0].champion.id, "MonkeyKing");
  assert.equal(searchSkins(index, "   ").length, 0);
  assert.equal(searchSkins(index, "nothing matches").length, 0);
  assert.ok(matchesSearch("Kha’Zix", "khazix"));
  assert.ok(matchesSearch("Kai’Sa", "kai sa"));
});
test("a search target opens the exact skin or chroma rather than the saved skin", () => {
  const base = {
    id: "103014",
    num: 14,
    name: "Spirit Blossom Ahri",
    championId: "Ahri",
    championName: "Ahri",
  };
  const groups: SkinGroup[] = [
    {
      base,
      chromas: [
        { ...base, id: "103015", num: 15, name: "Ruby", parentName: base.name, colors: [] },
      ],
    },
  ];
  assert.deepEqual(galleryTarget(groups, "103014"), { index: 0, chromaId: null });
  assert.deepEqual(galleryTarget(groups, "103015"), { index: 0, chromaId: "103015" });
  assert.equal(galleryTarget(groups, "missing"), null);
});
test("artwork sampling ignores transparency and extreme lighting, and retains a second hue", () => {
  const palette = paletteFromPixels([
    255, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 210, 40, 45, 255, 210, 40, 45, 255, 20, 90, 210,
    255,
  ]);
  assert.deepEqual(palette.primary, [210, 40, 45]);
  assert.deepEqual(palette.secondary, [20, 90, 210]);
  assert.ok(paletteFromPixels([]).primary.every(Number.isFinite));
});
test("light and dark artwork themes keep text and accents readable across the hue wheel", () => {
  const colors: RGB[] = [
    [220, 45, 55],
    [45, 190, 75],
    [35, 80, 225],
    [235, 215, 45],
    [110, 110, 110],
    [210, 80, 200],
  ];
  for (const mode of ["dark", "light"])
    for (const primary of colors) {
      const theme = artworkTheme({ primary, secondary: primary }, mode),
        base = rgb(theme["--art-base"]);
      for (const property of ["--art-accent", "--art-muted", "--art-foreground"])
        assert.ok(
          contrast(rgb(theme[property]), base) >= 4.5,
          `${mode}: ${property} on ${primary}`
        );
    }
  assert.notEqual(
    artworkTheme({ primary: colors[0], secondary: colors[0] }, "dark")["--art-base"],
    artworkTheme({ primary: colors[2], secondary: colors[2] }, "dark")["--art-base"]
  );
  const neutral = artworkTheme({ primary: [110, 110, 110], secondary: [110, 110, 110] }, "dark");
  assert.ok(rgbToHsl(rgb(neutral["--art-accent"]))[1] < 0.12);
});
