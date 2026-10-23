import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSkinMetadata, skinRarity } from "../src/lib/skinRarity.ts";

test("client tiers include current premium tiers and distinguish standard from unknown", () => {
  const codes = [
    "kNoRarity",
    "kRare",
    "kEpic",
    "kLegendary",
    "kMythic",
    "kUltimate",
    "kExalted",
    "kTranscendent",
  ];
  const raw = Object.fromEntries(
    codes.map((rarity, index) => [String(1000 + index), { id: 1000 + index, rarity }])
  );
  const { rarities } = parseSkinMetadata({
    ...raw,
    future: { id: 2001, rarity: "kFutureTier", cost: 1820 },
    missing: { id: 2002 },
  });
  assert.deepEqual(
    codes.map((_, index) => rarities[String(1000 + index)]),
    ["standard", "rare", "epic", "legendary", "mythic", "ultimate", "exalted", "transcendent"]
  );
  assert.equal(skinRarity(rarities, "2001"), null);
  assert.equal(skinRarity(rarities, "2002"), null);
});
test("chromas inherit their parent skin tier while explicit client tiers take precedence", () => {
  const { rarities, chromas } = parseSkinMetadata({
    parent: {
      id: 103027,
      rarity: "kLegendary",
      chromas: [{ id: 103029, colors: ["#6ABBEE", "#6ABBEE", 42, "invalid"] }, { id: 103030 }],
    },
    explicit: { id: 103030, rarity: "kMythic" },
  });
  assert.equal(rarities["103029"], "legendary");
  assert.equal(rarities["103030"], "mythic");
  assert.deepEqual(chromas["103029"], { parentId: 103027, colors: ["#6ABBEE", "#6ABBEE"] });
  assert.deepEqual(chromas["103030"].colors, []);
});
test("rarity lookup falls back to the gallery parent only when the selected skin is unknown", () => {
  const rarities = { "103027": "legendary", "103030": "mythic" } as const;
  assert.equal(skinRarity(rarities, "103029", "103027"), "legendary");
  assert.equal(skinRarity(rarities, "103030", "103027"), "mythic");
  assert.equal(skinRarity(rarities, "missing"), null);
});
test("malformed client responses never label every skin standard", () => {
  for (const value of [null, {}, "error", { message: "unavailable" }])
    assert.throws(() => parseSkinMetadata(value), /unavailable/);
  assert.deepEqual(
    parseSkinMetadata({ valid: { id: 103001, rarity: "kNoRarity", chromas: null }, invalid: null })
      .rarities,
    { "103001": "standard" }
  );
});
test("the bundled offline snapshot includes verified existing and current-patch examples", () => {
  const rarities = JSON.parse(
    readFileSync(new URL("../src/data/skin-rarities.json", import.meta.url), "utf8")
  );
  assert.equal(rarities["103027"], "legendary"); // Spirit Blossom Ahri
  assert.equal(rarities["103015"], "epic"); // K/DA Ahri
  assert.equal(rarities["84103"], "legendary"); // True Damage Know My Name Akali
  assert.equal(rarities["245059"], "mythic"); // Prestige True Damage Know My Name Ekko
  assert.equal(rarities["103085"], "transcendent"); // Risen Legend Ahri
});
