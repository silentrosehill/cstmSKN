import test from "node:test";
import assert from "node:assert/strict";
import {
  newestWindowsRelease,
  versionParts,
  WindowsUpdateStore,
  type ReleaseInfo,
} from "../src/lib/windowsUpdate.ts";

const release = (
  tag: string,
  assets: string[] = ["cstmSKN-Windows-x64-setup.exe"]
): ReleaseInfo => ({
  tag,
  url: `https://github.com/silentrosehill/cstmSKN/releases/tag/${tag}`,
  notes: `Notes for ${tag}`,
  assets,
});

test("reads versions from release tags", () => {
  assert.deepEqual(versionParts("v1.0.2-windows-alpha.3"), [1, 0, 2, 3]);
  assert.deepEqual(versionParts("1.10.0"), [1, 10, 0, Infinity]);
  assert.equal(versionParts("windows-preview"), null);
});

test("picks the newest Windows release and ignores Mac-only ones", () => {
  const releases = [
    release("v1.0.1-windows-alpha.1"),
    release("v1.2.0", ["cstmSKN_aarch64.app.tar.gz", "latest.json"]),
    release("v1.1.0-windows-alpha.1", ["cstmSKN-Windows-x64-portable.zip"]),
    release("v1.0.3-windows-alpha.1"),
  ];
  assert.deepEqual(newestWindowsRelease(releases, "1.0.1-windows-alpha.1"), {
    version: "1.1.0-windows-alpha.1",
    url: "https://github.com/silentrosehill/cstmSKN/releases/tag/v1.1.0-windows-alpha.1",
    notes: "Notes for v1.1.0-windows-alpha.1",
  });
});

test("nothing to offer when this build is current or newer", () => {
  const current = "1.0.1-windows-alpha.2";
  assert.equal(newestWindowsRelease([release("v1.0.1-windows-alpha.2")], current), null);
  assert.equal(newestWindowsRelease([release("v1.0.1-windows-alpha.1")], current), null);
  assert.equal(newestWindowsRelease([release("v1.0.0-windows-alpha.9")], current), null);
  assert.equal(newestWindowsRelease([], current), null);
});

test("a newer alpha of the same version, or its full release, is an update", () => {
  const current = "1.0.1-windows-alpha.1";
  assert.equal(
    newestWindowsRelease([release("v1.0.1-windows-alpha.2")], current)?.version,
    "1.0.1-windows-alpha.2"
  );
  assert.equal(
    newestWindowsRelease([release("v1.0.1-windows")], current)?.version,
    "1.0.1-windows"
  );
});

test("store reports available, current and errors", async () => {
  let releases: ReleaseInfo[] = [release("v1.0.2-windows-alpha.1")];
  let fail = false;
  const store = new WindowsUpdateStore(async () => {
    if (fail) throw new Error("offline");
    return releases;
  }, "1.0.1-windows-alpha.1");
  assert.equal((await store.check()).stage, "available");
  releases = [];
  assert.equal((await store.check()).stage, "current");
  fail = true;
  const state = await store.check();
  assert.equal(state.stage, "error");
  assert.match(state.stage === "error" ? state.error : "", /offline/);
});
