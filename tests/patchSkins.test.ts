import test from "node:test";
import assert from "node:assert/strict";
import {
  newPatchSkins,
  patchVersions,
  patchLabel,
  type RiotRoster,
} from "../src/lib/patchSkins.ts";
const before: RiotRoster = {
  data: {
    Ahri: {
      id: "Ahri",
      key: "103",
      name: "Ahri",
      title: "",
      tags: [],
      skins: [
        { id: "103000", num: 0, name: "default" },
        { id: "103001", num: 1, name: "Old name" },
      ],
    },
  },
};
test("patch comparison skips hotfix builds of the same patch and handles a new season", () => {
  assert.deepEqual(patchVersions(["16.21.2", "16.21.1", "16.20.2", "16.20.1"]), {
    current: "16.21.2",
    previous: "16.20.2",
  });
  assert.deepEqual(patchVersions(["17.1.1", "16.24.1"]), {
    current: "17.1.1",
    previous: "16.24.1",
  });
  assert.throws(() => patchVersions(["16.21.1"]), /unavailable/);
  assert.throws(() => patchVersions([]), /unavailable/);
  assert.equal(patchLabel("16.21.1"), "26.21");
  assert.equal(patchLabel("14.24.1"), "14.24");
});
test("new patch skins compare stable IDs and exclude chromas, defaults, and Classic duplicates", () => {
  const after: RiotRoster = {
    data: {
      Ahri: {
        ...before.data.Ahri,
        skins: [
          { id: 103000, num: 0, name: "default" },
          { id: 103001, num: 1, name: "Renamed old skin" },
          { id: "103014", num: 14, name: "New skin", chromas: true },
          { id: "103015", num: 15, name: "New skin (Ruby)", parentSkin: 14 },
        ],
      },
      NewChampion: {
        id: "NewChampion",
        key: "999",
        name: "NewChampion",
        title: "",
        tags: [],
        skins: [
          { id: "999000", num: 0, name: "default" },
          { id: "999001", num: 1, name: "Launch skin" },
        ],
      },
      Jade_Ahri: {
        ...before.data.Ahri,
        id: "Jade_Ahri",
        key: "60001",
        skins: [{ id: "60001001", num: 1, name: "Classic variant" }],
      },
    },
  };
  const added = newPatchSkins(after, before);
  assert.deepEqual(
    added.map((entry) => entry.skin.id),
    ["103014", "999001"]
  );
  assert.equal(added[0].champion.id, "Ahri");
  assert.equal(added[0].skin.championName, "Ahri");
});
test("a patch with no additions stays empty and missing previous data never labels the whole catalog new", () => {
  assert.deepEqual(newPatchSkins(before, before), []);
  assert.throws(() => newPatchSkins(before, { data: {} }), /unavailable/);
});
