import test from "node:test";
import assert from "node:assert/strict";
import {
  getItem,
  setItem,
  removeItem,
  readStored,
  stringList,
  stringRecord,
} from "../src/lib/storage.ts";
import { sanitizeLoadout } from "../src/lib/collections.ts";

test("disabled and full storage cannot interrupt a selection or favorite action", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Blocked");
    },
  });
  try {
    assert.equal(getItem("selection"), null);
    assert.equal(setItem("selection", "new"), false);
    assert.doesNotThrow(() => removeItem("selection"));
    assert.deepEqual(readStored("selection", []), []);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem() {
          return "{invalid";
        },
        setItem() {
          throw new Error("QuotaExceededError");
        },
      },
    });
    assert.deepEqual(readStored("selection", {}), {});
    assert.equal(setItem("favorite", "skin"), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
test("valid JSON with an invalid shape cannot crash champion filters or loadouts", () => {
  assert.deepEqual(stringList({ includes: false }), []);
  assert.deepEqual(stringList(["Ahri", null, 4, "Ahri"]), ["Ahri"]);
  assert.deepEqual(stringRecord(["wrong"]), {});
  assert.deepEqual(stringRecord({ mod: "Ahri", invalid: null }), { mod: "Ahri" });
  assert.deepEqual(sanitizeLoadout({ skins: [], customs: {} }), { skins: {}, customs: [] });
});
