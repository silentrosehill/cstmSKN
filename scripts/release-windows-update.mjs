// Sign a CI-built Windows installer with the update key and write the Windows update feed.
// The private key never leaves this machine: CI builds, this script signs.
//   node scripts/release-windows-update.mjs --key <cstmSKN.key> --installer <setup.exe> --notes-file <notes.md>
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    key: { type: "string" },
    installer: { type: "string" },
    "notes-file": { type: "string" },
  },
});
const key = values.key ?? process.env.TAURI_SIGNING_PRIVATE_KEY_PATH;
if (!key) throw new Error("Set --key to the protected signing-key file");
if (!values.installer)
  throw new Error("Set --installer to the CI-built cstmSKN-Windows-x64-setup.exe");
const keyPath = resolve(key);
const installer = resolve(values.installer);
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const config = JSON.parse(await readFile(join(root, "src-tauri/tauri.conf.json"), "utf8"));
if ((await readFile(keyPath + ".pub", "utf8")).trim() !== config.plugins.updater.pubkey.trim())
  throw new Error("Signing key does not match the app's verification key");
let password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
if (password === undefined) {
  try {
    password = (await readFile(keyPath + ".password", "utf8")).trim();
  } catch {
    password = "";
  }
}
const result = spawnSync(
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
    installer,
  ],
  {
    cwd: root,
    env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password },
    stdio: "inherit",
  }
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Signing failed (${result.status})`);
const tag = `v${manifest.version}-${manifest.windowsBuild}`;
const feed = {
  version: manifest.version,
  notes: values["notes-file"]
    ? await readFile(resolve(values["notes-file"]), "utf8")
    : "Update cstmSKN to the latest Windows preview.",
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: (await readFile(installer + ".sig", "utf8")).trim(),
      url: `https://github.com/silentrosehill/cstmSKN/releases/download/${tag}/cstmSKN-Windows-x64-setup.exe`,
    },
  },
};
await mkdir(join(root, "updates"), { recursive: true });
await writeFile(join(root, "updates/windows.json"), JSON.stringify(feed, null, 2) + "\n");
console.log(`Signed ${installer} for ${manifest.version}; wrote updates/windows.json for ${tag}`);
console.log("Publish the installer on that release, then commit and push updates/windows.json.");
