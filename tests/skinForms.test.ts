import test from "node:test";
import assert from "node:assert/strict";
import { findSkinForms } from "../src/lib/skinForms.ts";

const skinIds: Record<string, string> = {
  "99000": "Lux",
  "99007": "Elementalist Lux",
  "147001": "K/DA ALL OUT Seraphine Indie",
  "145001": "Bullet Angel Kai'Sa",
  "145002": "Bullet Angel Kai'Sa (Catseye)",
  "141020": "HEARTSTEEL Kayn",
  "141026": "Battle Academia Kayn",
};
const paths: [string, string][] = [
  ["99007", "skins/99/99007/99007.fantome"],
  ["99992", "skins/99/99007/99992/99992.fantome"],
  ["99991", "skins/99/99007/99991/99991.fantome"],
  ["147002", "skins/147/147001/147002/147002.fantome"],
  ["147003", "skins/147/147001/147003/147003.fantome"],
  ["145002", "skins/145/145001/145002/145002.fantome"],
  ["145003", "skins/145/145001/145003/145003.fantome"],
  ["141026", "skins/141/141020/141026/141026.fantome"],
  ["4035", "skins/4/4000/4035/4035.fantome"],
];
const chromas = new Set([145003]);

test("finds forms, numbers them after the base form and names known tiers", () => {
  const forms = findSkinForms(paths, skinIds, (id) => chromas.has(id));
  assert.deepEqual(
    forms.get("99007")?.map((f) => [f.id, f.name]),
    [
      ["99991", "Elementalist Lux (Form 2)"],
      ["99992", "Elementalist Lux (Form 3)"],
    ]
  );
  assert.deepEqual(
    forms.get("147001")?.map((f) => f.name),
    ["K/DA ALL OUT Seraphine Indie (Rising Star)", "K/DA ALL OUT Seraphine Indie (Superstar)"]
  );
  assert.equal(
    forms.get("99007")?.[0].image,
    "https://raw.githubusercontent.com/Alban1911/LeagueSkins/main/skins/99/99007/99991/99991.png"
  );
});

test("chromas, real skins and entries under a default skin are not forms", () => {
  const forms = findSkinForms(paths, skinIds, (id) => chromas.has(id));
  assert.equal(forms.has("145001"), false);
  assert.equal(forms.has("141020"), false);
  assert.equal(forms.has("4000"), false);
});
