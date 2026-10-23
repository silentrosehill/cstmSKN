import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TAB_ORDER,
  sanitizeNavigation,
  toggleTab,
  moveTab,
} from "../src/lib/navigation.ts";
test("sidebar preferences migrate missing tabs, remove stale IDs and deduplicate saved data", () => {
  const migrated = sanitizeNavigation({
    order: ["favorites", "old-tab", "favorites", "champions"],
    hidden: ["my-skins", "settings", "old-tab", "my-skins"],
  });
  assert.deepEqual(migrated.order.slice(0, 2), ["favorites", "champions"]);
  assert.equal(migrated.order.length, DEFAULT_TAB_ORDER.length);
  assert.equal(new Set(migrated.order).size, DEFAULT_TAB_ORDER.length);
  assert.deepEqual(migrated.hidden, ["my-skins"]);
  assert.deepEqual(sanitizeNavigation(null), { order: [...DEFAULT_TAB_ORDER], hidden: [] });
});
test("hidden tabs can be restored, but settings always stays reachable", () => {
  let preferences = sanitizeNavigation({});
  for (const id of DEFAULT_TAB_ORDER) preferences = toggleTab(preferences, id);
  assert.deepEqual(
    preferences.order.filter((id) => !preferences.hidden.includes(id)),
    ["settings"]
  );
  preferences = toggleTab(preferences, "champions");
  assert.equal(preferences.hidden.includes("champions"), false);
  assert.equal(preferences.hidden.includes("settings"), false);
});
test("reordering preserves hidden tabs and clamps moves without mutating saved preferences", () => {
  const initial = toggleTab(sanitizeNavigation({}), "favorites");
  const moved = moveTab(initial, "game-mods", 0);
  assert.equal(moved.order[0], "game-mods");
  assert.deepEqual(moved.hidden, ["favorites"]);
  assert.equal(initial.order[0], "whats-new");
  const last = moveTab(moved, "game-mods", 999);
  assert.equal(last.order.at(-1), "game-mods");
  const first = moveTab(last, "game-mods", -10);
  assert.equal(first.order[0], "game-mods");
  assert.equal(new Set(first.order).size, DEFAULT_TAB_ORDER.length);
});
