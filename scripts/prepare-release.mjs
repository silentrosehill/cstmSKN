import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    key: { type: "string" },
    output: { type: "string" },
    "target-dir": { type: "string" },
    "skip-build": { type: "boolean", default: false },
    "notes-file": { type: "string" },
  },
});
if (process.platform !== "darwin" || process.arch !== "arm64")
  throw new Error("This release target requires an Apple Silicon Mac");
const key = values.key ?? process.env.TAURI_SIGNING_PRIVATE_KEY_PATH;
if (!key) throw new Error("Set --key to the protected signing-key file");
const keyPath = resolve(key),
  secret = await readFile(keyPath, "utf8");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const config = JSON.parse(await readFile(join(root, "src-tauri/tauri.conf.json"), "utf8"));
if (config.version !== manifest.version) throw new Error("Application versions differ");
for (const field of ["CFBundleShortVersionString", "CFBundleVersion"]) {
  const result = spawnSync(
    "/usr/libexec/PlistBuddy",
    ["-c", `Print :${field}`, join(root, "src-tauri/Info.plist")],
    { encoding: "utf8" }
  );
  if (result.status !== 0 || result.stdout.trim() !== manifest.version)
    throw new Error(`Info.plist ${field} differs from package.json`);
}
if ((await readFile(keyPath + ".pub", "utf8")).trim() !== config.plugins.updater.pubkey.trim())
  throw new Error("Signing key does not match the app's verification key");
const output = resolve(values.output ?? join(root, "release"));
const target = resolve(
  values["target-dir"] ?? process.env.CARGO_TARGET_DIR ?? join(root, "src-tauri/target")
);
let password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
if (password === undefined) {
  try {
    password = (await readFile(keyPath + ".password", "utf8")).trim();
  } catch {
    password = "";
  }
}
const env = {
  ...process.env,
  CARGO_TARGET_DIR: target,
  TAURI_SIGNING_PRIVATE_KEY: secret,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
  COPYFILE_DISABLE: "1",
};
function run(command, args, environment = env) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
if (!values["skip-build"]) {
  run("npm", ["test"]);
  run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml", "--lib"]);
  run("npm", ["run", "tauri", "--", "build", "--bundles", "app"]);
}
await mkdir(output, { recursive: true });
const app = join(output, "cstmSKN.app");
await rm(app, { recursive: true, force: true });
run("/usr/bin/ditto", [join(target, "release/bundle/macos/cstmSKN.app"), app]);
for (const field of ["CFBundleShortVersionString", "CFBundleVersion"]) {
  const result = spawnSync(
    "/usr/libexec/PlistBuddy",
    ["-c", `Print :${field}`, join(app, "Contents/Info.plist")],
    { encoding: "utf8" }
  );
  if (result.status !== 0 || result.stdout.trim() !== manifest.version)
    throw new Error(`Built app ${field} differs from release version`);
}
run("/usr/bin/codesign", ["--force", "--sign", "-", join(app, "Contents/MacOS/mod-tools")]);
run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", app]);
run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
const archive = join(output, "cstmSKN.app.tar.gz");
run("/usr/bin/tar", ["-czf", archive, "-C", output, "cstmSKN.app"]);
const signingEnv = { ...env };
delete signingEnv.TAURI_SIGNING_PRIVATE_KEY;
run(
  "npm",
  [
    "run",
    "tauri",
    "--",
    "signer",
    "sign",
    "--private-key-path",
    keyPath,
    "--app-version",
    manifest.version,
    archive,
  ],
  signingEnv
);
run("/usr/bin/ditto", [
  "-c",
  "-k",
  "--sequesterRsrc",
  "--keepParent",
  app,
  join(output, "cstmSKN-macOS-arm64.zip"),
]);
const signature = (await readFile(archive + ".sig", "utf8")).trim();
const notes = values["notes-file"]
  ? await readFile(resolve(values["notes-file"]), "utf8")
  : "Update cstmSKN to the latest release.";
const latest = {
  version: manifest.version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "darwin-aarch64": {
      signature,
      url: `https://github.com/silentrosehill/cstmSKN/releases/download/v${manifest.version}/cstmSKN.app.tar.gz`,
    },
  },
};
await writeFile(join(output, "latest.json"), JSON.stringify(latest, null, 2) + "\n");
console.log(`Prepared signed cstmSKN ${manifest.version} in ${output}`);
