import test from "node:test";
import assert from "node:assert/strict";
import {
  groupLibrarySkins,
  groupDownloads,
  deckFrontIndex,
  deckVariant,
  deckTarget,
} from "../src/lib/libraryDeck.ts";
import { downloadChoice } from "../src/lib/downloadChoice.ts";
import { chooseSkin } from "../src/lib/selection.ts";
import type { DownloadedSkin, Skin } from "../src/types/index.ts";

const file = (champion: string, name: string): DownloadedSkin => ({
  champion_name: champion,
  skin_name: name,
  zip_path: `/${champion}/${name}.fantome`,
});
const chroma = (name: string) =>
  name.includes("(Ruby)") ? { parentName: name.replace(" (Ruby)", ""), colors: ["#d33648"] } : null;
const downloads = [
  file("Camille", "Coven Camille"),
  file("Ahri", "Spirit Blossom Ahri (Ruby)"),
  file("Ahri", "K/DA Ahri"),
  file("Ahri", "Spirit Blossom Ahri"),
  file("Ahri", "Spirit Blossom Ahri"),
];
const skin: Skin = {
  id: "103007",
  num: 7,
  name: "Spirit Blossom Ahri",
  championId: "Ahri",
  championName: "Ahri",
};

test("installed files become one stable deck per champion and chromas remain with their base", () => {
  const decks = groupLibrarySkins(downloads, chroma);
  assert.deepEqual(
    decks.map((deck) => deck.champion),
    ["Ahri", "Camille"]
  );
  assert.deepEqual(
    decks[0].groups.map((group) => group.name),
    ["K/DA Ahri", "Spirit Blossom Ahri"]
  );
  assert.equal(groupDownloads(decks[0].groups[1]).length, 2);
  assert.equal(downloads.length, 5);
  assert.deepEqual(groupLibrarySkins([], chroma), []);
});
test("the selected skin or chroma always wins over the previously browsed top card", () => {
  const groups = groupLibrarySkins(downloads, chroma)[0].groups;
  assert.equal(deckFrontIndex(groups, "Spirit Blossom Ahri", "K/DA Ahri"), 1);
  assert.equal(deckFrontIndex(groups, "Spirit Blossom Ahri (Ruby)", "K/DA Ahri"), 1);
  assert.equal(
    deckVariant(groups[1], "Spirit Blossom Ahri (Ruby)").skin_name,
    "Spirit Blossom Ahri (Ruby)"
  );
  assert.equal(deckFrontIndex(groups, undefined, "Spirit Blossom Ahri"), 1);
  assert.equal(deckFrontIndex(groups, "Deleted skin", "Deleted group"), 0);
});
test("chroma-only installations never fabricate a selectable missing base", () => {
  const group = groupLibrarySkins([file("Ahri", "Spirit Blossom Ahri (Ruby)")], chroma)[0]
    .groups[0];
  assert.equal(group.base, null);
  assert.equal(deckVariant(group).skin_name, "Spirit Blossom Ahri (Ruby)");
  assert.equal(deckVariant(group, "Spirit Blossom Ahri").skin_name, "Spirit Blossom Ahri (Ruby)");
  assert.deepEqual(
    groupDownloads(group).map((download) => download.skin_name),
    ["Spirit Blossom Ahri (Ruby)"]
  );
});
test("decks wrap both directions and stale selections recover after removing a card", () => {
  assert.equal(deckTarget(0, 3, -1), 2);
  assert.equal(deckTarget(2, 3, 1), 0);
  assert.equal(deckTarget(0, 1, 1), 0);
  assert.equal(deckTarget(0, 0, 1), 0);
  const remaining = groupLibrarySkins(
    downloads.filter((download) => !download.skin_name.includes("Spirit")),
    chroma
  )[0].groups;
  assert.equal(deckFrontIndex(remaining, "Spirit Blossom Ahri", "Spirit Blossom Ahri"), 0);
  assert.equal(deckVariant(remaining[0]).skin_name, "K/DA Ahri");
});
test("Download only saves the requested file without changing any champion selection", async () => {
  let selection = {
    skins: { Ahri: "Existing Ahri", Camille: "Keep Camille" },
    customs: ["Voice pack"],
  };
  const before = structuredClone(selection);
  const calls: string[][] = [];
  assert.equal(
    await downloadChoice(
      skin,
      "/skin",
      false,
      async (...args) => {
        calls.push(args);
        return true;
      },
      (look, enabled) => {
        selection = chooseSkin(selection, look, enabled, [], [], {});
      }
    ),
    true
  );
  assert.deepEqual(calls, [["/skin", "Ahri", skin.name]]);
  assert.deepEqual(selection, before);
});
test("Download & select waits for success and replaces only the requested champion", async () => {
  let selection = { skins: { Ahri: "Old", Camille: "Keep" }, customs: [] as string[] };
  let finish: (success: boolean) => void = () => {};
  const pending = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const result = downloadChoice(
    skin,
    "/skin",
    true,
    () => pending,
    (look, enabled) => {
      selection = chooseSkin(selection, look, enabled, [], [], {});
    }
  );
  assert.equal(selection.skins.Ahri, "Old");
  finish(true);
  await result;
  assert.deepEqual(selection, { skins: { Ahri: skin.name, Camille: "Keep" }, customs: [] });
});
test("failed or rejected downloads never select a skin", async () => {
  let selected = false;
  assert.equal(
    await downloadChoice(
      skin,
      "/skin",
      true,
      async () => false,
      () => {
        selected = true;
      }
    ),
    false
  );
  await assert.rejects(
    downloadChoice(
      skin,
      "/skin",
      true,
      async () => {
        throw new Error("Offline");
      },
      () => {
        selected = true;
      }
    ),
    /Offline/
  );
  assert.equal(selected, false);
});
