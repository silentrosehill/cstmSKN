import test from "node:test";
import assert from "node:assert/strict";
import {
  AppUpdateController,
  isUpdateBlocking,
  type AppUpdate,
  type UpdateProgress,
} from "../src/lib/appUpdates.ts";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const calls: string[] = [];
  const update: AppUpdate = {
    version: "0.1.19",
    body: "A release",
    async download(progress) {
      calls.push("download");
      progress({ event: "Started", data: { contentLength: 100 } });
      progress({ event: "Progress", data: { chunkLength: 200 } });
      progress({ event: "Finished" });
    },
    async install() {
      calls.push("install");
    },
    async close() {
      calls.push("close");
    },
  };
  let blocked: string | null = null;
  const controller = new AppUpdateController({
    check: async () => {
      calls.push("check");
      return update;
    },
    relaunch: async () => {
      calls.push("restart");
    },
    blockedReason: () => blocked,
  });
  return {
    controller,
    update,
    calls,
    block: (reason: string | null) => {
      blocked = reason;
    },
  };
}
test("updating downloads and verifies before installing, then restarts once", async () => {
  const { controller, calls } = fixture();
  const stages: string[] = [],
    percents: number[] = [];
  controller.subscribe(() => {
    const state = controller.getSnapshot();
    stages.push(state.stage);
    if (state.percent !== null) percents.push(state.percent);
  });
  await controller.check();
  assert.equal(controller.getSnapshot().stage, "available");
  await controller.install();
  assert.deepEqual(calls, ["check", "download", "install", "close", "restart"]);
  assert.ok(stages.indexOf("downloading") < stages.indexOf("installing"));
  assert.ok(stages.indexOf("installing") < stages.indexOf("restarting"));
  assert.ok(percents.every((percent) => percent >= 0 && percent <= 100));
});
test("failed checks are errors, never a false up-to-date result", async () => {
  const controller = new AppUpdateController({
    check: async () => {
      throw new Error("offline");
    },
    relaunch: async () => {},
    blockedReason: () => null,
  });
  await controller.check();
  assert.equal(controller.getSnapshot().stage, "error");
  assert.ok(controller.getSnapshot().error);
  const current = new AppUpdateController({
    check: async () => null,
    relaunch: async () => {},
    blockedReason: () => null,
  });
  await current.check();
  assert.equal(current.getSnapshot().stage, "current");
});
test("installation rechecks current patcher/import/download activity", async () => {
  const { controller, calls, block } = fixture();
  await controller.check();
  block("Stop the patcher before updating.");
  await controller.install();
  assert.deepEqual(calls, ["check"]);
  assert.equal(controller.getSnapshot().stage, "available");
  block(null);
  await controller.install();
  assert.ok(calls.includes("install"));
});
test("signature failure never installs or restarts and releases the download resource", async () => {
  const { controller, update, calls } = fixture();
  update.download = async () => {
    calls.push("download");
    throw new Error("signature verification failed");
  };
  await controller.check();
  await controller.install();
  assert.deepEqual(calls, ["check", "download", "close"]);
  assert.equal(controller.getSnapshot().stage, "error");
  assert.match(controller.getSnapshot().error!, /verified/);
});
test("install failures leave a retryable error and do not restart", async () => {
  const { controller, update, calls } = fixture();
  update.install = async () => {
    throw new Error("disk full");
  };
  await controller.check();
  await controller.install();
  assert.equal(controller.getSnapshot().stage, "error");
  assert.ok(!calls.includes("restart"));
});
test("duplicate checks and install clicks never race another update operation", async () => {
  const pending = deferred<AppUpdate | null>();
  let checks = 0;
  const controller = new AppUpdateController({
    check: () => {
      checks++;
      return pending.promise;
    },
    relaunch: async () => {},
    blockedReason: () => null,
  });
  const first = controller.check();
  await controller.check();
  pending.resolve(null);
  await first;
  assert.equal(checks, 1);
  const f = fixture(),
    download = deferred<void>();
  f.update.download = () => download.promise;
  await f.controller.check();
  const installing = f.controller.install();
  await f.controller.install();
  await f.controller.check();
  assert.deepEqual(f.calls, ["check"]);
  download.resolve();
  await installing;
  assert.deepEqual(f.calls, ["check", "install", "close", "restart"]);
});
test("a failed restart keeps the installed update in a blocking restart-required state", async () => {
  const f = fixture();
  let restarts = 0;
  const controller = new AppUpdateController({
    check: async () => f.update,
    relaunch: async () => {
      if (++restarts === 1) throw new Error("restart unavailable");
    },
    blockedReason: () => null,
  });
  await controller.check();
  await controller.install();
  assert.equal(controller.getSnapshot().stage, "restart-required");
  assert.ok(isUpdateBlocking(controller.getSnapshot().stage));
  await controller.restart();
  assert.equal(restarts, 2);
});
test("unknown content lengths stay indeterminate instead of showing invalid progress", async () => {
  const f = fixture();
  let progress: (event: UpdateProgress) => void = () => {};
  const done = deferred<void>();
  f.update.download = (event) => {
    progress = event;
    return done.promise;
  };
  await f.controller.check();
  const installing = f.controller.install();
  progress({ event: "Started" });
  progress({ event: "Progress", data: { chunkLength: 45 } });
  assert.equal(f.controller.getSnapshot().percent, null);
  done.resolve();
  await installing;
});
test("checking again releases the previous available update", async () => {
  const f = fixture();
  await f.controller.check();
  await f.controller.check();
  assert.deepEqual(f.calls, ["check", "close", "check"]);
});
