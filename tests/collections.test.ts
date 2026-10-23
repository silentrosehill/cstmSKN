import test from "node:test";
import assert from "node:assert/strict";
import { chooseCustom, chooseSkin } from "../src/lib/selection.ts";
import {
  restoreLoadout,
  sanitizeFavorites,
  sanitizeLoadout,
  ChampionNavigationGate,
} from "../src/lib/collections.ts";
import { modFileName, supportedModPath } from "../src/lib/mods.ts";
import { TAB_ACCENTS, tabAccent } from "../src/lib/tabAccent.ts";
import type { Champion, CustomMod, Skin } from "../src/types/index.ts";
const champions: Champion[] = [
  { id: "Ahri", name: "Ahri", key: "103", title: "", tags: [] },
  { id: "Camille", name: "Camille", key: "164", title: "", tags: [] },
];
const mod = (name: string, kind: CustomMod["kind"], targets: string[] = []): CustomMod => ({
  name,
  kind,
  champions: targets,
  file_path: `/mods/${name}.fantome`,
  enabled: false,
});
const mods = [
  mod("Fox", "skin", ["ahri"]),
  mod("Voice A", "voice", ["ahri"]),
  mod("Voice B", "voice", ["ahri"]),
  mod("Camille Voice", "voice", ["camille"]),
  mod("Winter", "map"),
  mod("Summer", "map"),
  mod("Announcer A", "announcer"),
  mod("Announcer B", "announcer"),
  mod("Music", "other"),
  mod("HUD", "other"),
];
const skin: Skin = {
  id: "103007",
  num: 7,
  name: "Spirit Blossom Ahri",
  championId: "Ahri",
  championName: "Ahri",
};
test("a voice pack coexists with a visual skin and other champions, replacing only that champion's voice", () => {
  const before = {
    skins: { Ahri: "Fox look", Camille: "Steel look" },
    customs: ["Voice A", "Camille Voice", "Winter"],
  };
  assert.deepEqual(chooseCustom(before, mods[2], true, mods, champions, {}), {
    skins: before.skins,
    customs: ["Camille Voice", "Winter", "Voice B"],
  });
  assert.deepEqual(before.customs, ["Voice A", "Camille Voice", "Winter"]);
});
test("changing the visual skin keeps its champion voice enabled", () => {
  assert.deepEqual(
    chooseSkin(
      { skins: {}, customs: ["Fox", "Voice A", "Winter"] },
      skin,
      true,
      mods,
      champions,
      {}
    ),
    { skins: { Ahri: skin.name }, customs: ["Voice A", "Winter"] }
  );
  assert.deepEqual(
    chooseCustom(
      { skins: { Ahri: "Regular" }, customs: ["Voice A"] },
      mods[0],
      true,
      mods,
      champions,
      {}
    ),
    { skins: {}, customs: ["Voice A", "Fox"] }
  );
});
test("maps and announcers need no champion and only replace their own global slot", () => {
  const first = chooseCustom(
    { skins: { Ahri: "Keep" }, customs: ["Winter", "Announcer A", "Voice A"] },
    mods[5],
    true,
    mods,
    champions,
    {}
  );
  assert.deepEqual(first, {
    skins: { Ahri: "Keep" },
    customs: ["Announcer A", "Voice A", "Summer"],
  });
  const second = chooseCustom(first, mods[7], true, mods, champions, {});
  assert.deepEqual(second.customs, ["Voice A", "Summer", "Announcer B"]);
});
test("other mods coexist and unknown champion voice targets require assignment", () => {
  assert.deepEqual(
    chooseCustom({ skins: {}, customs: ["Music"] }, mods[9], true, mods, champions, {}).customs,
    ["Music", "HUD"]
  );
  const voice = mod("Unknown voice", "voice");
  assert.throws(
    () => chooseCustom({ skins: {}, customs: [] }, voice, true, [voice], champions, {}),
    /Choose a champion/
  );
  assert.deepEqual(
    chooseCustom({ skins: { Ahri: "Keep" }, customs: [] }, voice, true, [voice], champions, {
      "Unknown voice": "Ahri",
    }).skins,
    { Ahri: "Keep" }
  );
});
test("restoring a loadout resolves available files, reports missing items and keeps category replacement rules", () => {
  const downloads = [{ champion_name: "Ahri", skin_name: skin.name, zip_path: "/skin" }];
  const saved = {
    skins: { Ahri: skin.name, Camille: "Deleted skin" },
    customs: ["Voice A", "Voice B", "Winter", "Summer", "Missing mod"],
  };
  const restored = restoreLoadout(saved, downloads, mods, champions, {});
  assert.deepEqual(restored, {
    selection: { skins: { Ahri: skin.name }, customs: ["Voice B", "Summer"] },
    missing: ["Deleted skin", "Missing mod"],
  });
  assert.deepEqual(saved.customs, ["Voice A", "Voice B", "Winter", "Summer", "Missing mod"]);
});
test("saved selections and favorites tolerate corrupt storage without duplicate entries", () => {
  assert.deepEqual(
    sanitizeLoadout({ skins: { Ahri: 1, Camille: "Good" }, customs: [1, "Fox", "Fox", null] }),
    { skins: { Camille: "Good" }, customs: ["Fox"] }
  );
  assert.deepEqual(sanitizeLoadout(null), { skins: {}, customs: [] });
  assert.deepEqual(
    sanitizeFavorites({ skins: [skin, skin, { id: "broken" }, null], customs: ["Fox", "Fox"] }),
    { skins: [skin], customs: ["Fox"] }
  );
  assert.deepEqual(sanitizeFavorites("broken"), { skins: [], customs: [] });
});
test("global imports accept package and WAD formats while preserving names and rejecting loose audio", () => {
  assert.equal(supportedModPath("/mods/voice.fantome"), true);
  assert.equal(supportedModPath("/mods/Map11.WAD.CLIENT"), true);
  assert.equal(supportedModPath("/mods/voice.mp3"), false);
  assert.equal(supportedModPath("/mods/voice.client"), false);
  assert.equal(modFileName("C:\\Mods\\Ahri.en_US.wad.client"), "Ahri.en_US");
});
test("champion select opens once on lock-in and follows trades without reopening after manual navigation", () => {
  const gate = new ChampionNavigationGate();
  assert.equal(gate.accept({ state: "selecting", championId: 103, locked: false }, false), null);
  assert.equal(gate.accept({ state: "selecting", championId: 103, locked: true }, true), null);
  assert.equal(gate.accept({ state: "selecting", championId: 103, locked: true }, false), 103);
  assert.equal(gate.accept({ state: "selecting", championId: 103, locked: true }, false), null);
  assert.equal(gate.accept({ state: "selecting", championId: 164, locked: true }, false), 164);
  assert.equal(gate.accept({ state: "unavailable", championId: null, locked: false }, false), null);
  assert.equal(gate.accept({ state: "selecting", championId: 164, locked: true }, false), null);
  gate.accept({ state: "connected", championId: null, locked: false }, false);
  assert.equal(gate.accept({ state: "selecting", championId: 164, locked: true }, false), 164);
});
test("each tab has its own accent while a fixed color preference remains available", () => {
  assert.equal(Object.keys(TAB_ACCENTS).length, 10);
  assert.equal(new Set(Object.values(TAB_ACCENTS)).size, 10);
  assert.equal(tabAccent("champions", "rose", "tab"), "ocean");
  assert.equal(tabAccent("game-mods", "rose", "tab"), "mod-rose");
  assert.equal(tabAccent("champions", "rose", "fixed"), "rose");
  assert.equal(tabAccent("unknown", "rose", "tab"), "rose");
});
