# cstmSKN Windows — integrated source-native injector preview

This branch connects the source-built native host/DLL to cstmSKN’s actual
Apply selection and Stop actions. The app builds cosmetic WAD overlays with the
open-source LeagueToolkit overlay builder and starts its own runtime. The complete,
unchanged official LTK Manager installer is also included for optional companion
setup. LTK remains a separate installed app, launched through its own tray mode.

## Test this Windows prerelease

1. Install `cstmSKN-Windows-x64-setup.exe`, or extract the portable ZIP into a fresh
   folder. Keep `native` beside `cstmSKN.exe` in the portable version.
2. Close other patchers. Confirm the League installation and select/import a
   known-working skin or mod. Click Apply selection before a fresh Practice Tool
   match. The app reports Waiting for game only after its native host loads.
3. The host discovers only `League of Legends.exe` at the exact selected game
   installation. It uses Windows’ normal window-hook interface and reports any
   Windows refusal; it does not bypass game or operating-system protections.
4. Attachment changes the status to Applying to game. In game is reported only
   after the DLL actually opens an overlay file. Check the skin itself: observed
   reads do not prove that all game assets or skin effects were replaced.
5. If no overlay reads are observed within 30 seconds of attachment, the engine
   stops with an explicit unsupported-file-loading/selection diagnostic.
6. Stop disables future overlay opens and removes this host’s window hook. It
   never terminates or assigns ownership of the game process. Resources already
   loaded into a running match are not reverted. Start a fresh match when changing
   selections or restarting an engine session during a match.

## Administrator handling and Windows protection

The native engine inherits the app’s real token. The previous Explorer relaunch
is not used in this build. If League runs as administrator, launch cstmSKN with
Windows’ ordinary Run as administrator action too. Settings displays the actual
app token. There is no misleading separate engine-elevation toggle.

**These binaries remain unsigned.** The previously reported `0xC0E90002` / Smart
App Control policy block still applies to our own DLL. Administrator rights do
not establish code-signing trust. Keep Windows protections enabled; this build
reports refusals instead of changing the policy. Signing is still pending.

## Implementation and limits

The DLL verifies the configured executable and controlling host. It changes
compatible CreateFileW/CreateFileA imports only in modules loaded from the
selected game folder, keeping game originals untouched. It refuses conflicting
imports. System modules are excluded; only the described file-opening import slots are changed. Game integrity checks remain unchanged. Only read-only
WAD opens under the configured game root can use a matching overlay file;
write and special opens pass through, with original-file fallback if an overlay
is unavailable. The DLL is pinned so removing a window hook leaves valid import
pointers. If its controlling host exits, future reads automatically fall back.

Direct NT file APIs, dynamically resolved I/O functions, modules loaded after
attachment and other file-loading paths may not be covered. The engine reports
lack of observed overlay reads rather than claiming success. Path matching is
lexical and is not a boundary against hostile reparse points. **Real League
compatibility and skin application remain unverified until tested on Windows.**

## Validation and build

The existing fixture tests exercise real cross-process DLL loading, 15 file/access
conditions, read-only fallback, clean Stop/restart, ownership-job cleanup for the
fixture only, and missing-DLL error preservation. An additional Windows Rust
integration test launches the same command/protocol helper used by Apply against
an owned fixture, requires ready → attached → observed overlay reads, then stops
and repeats. This tests actual native IPC/DLL behavior, not a simulated callback.
It does not substitute for a real game test.

```powershell
npm ci
python scripts/prepare-native-windows-engine.py
python scripts/prepare-ltk-companion.py --test-fixture
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
python scripts/windows-license-notices.py
npm test
npm run tauri -- build --bundles nsis
```

The preparation script compiles and tests the engine from this repository and
records its exact hashes. The app embeds that manifest and rejects stale/replaced
runtime files. The Windows workflow packages a complete NSIS installer and
portable app, corresponding source, licenses, provenance and checksums.
Original native engine source is GPL-3.0-or-later; the full license and all
open-source dependency notices accompany the build. No test fixture is bundled
in the production app. The macOS engine remains separate.
## LTK background companion

Windows builds can start a separately installed official LTK Manager 1.30.4 or
later when cstmSKN opens. Settings → LTK companion controls this option (on by
default). The complete official LTK Manager 1.30.4 installer is included with
both cstmSKN packages. Choose **Install LTK Manager** in Settings, complete its
official installer and one-time setup, then quit it before the first background
launch. Windows approval prompts and initial setup remain visible. Installing
cstmSKN does not automatically install LTK or accept LTK setup on your behalf.
Use **Open LTK Manager** to finish first-time setup or open its window when you
need it. **Start in background** requires setup to be complete.

Discovery, version-resource checks, signature verification and process detection
use native Windows APIs. A restricted PowerShell session cannot stop discovery.
Trust errors include the Windows code instead of a generic verification failure.
Windows signature, certificate revocation and app-control policies remain in force.

The `ltk-companion` resource folder retains the original official installer
artifact unchanged, together with its provenance, full GPL text and corresponding
source links. cstmSKN verifies its pinned SHA-256 and Windows Authenticode signature
before opening it. Patcher DLLs/hosts are not extracted into cstmSKN or re-signed.

cstmSKN discovers the installation in Windows uninstall registrations and the
standard installation folders, requires a valid Windows Authenticode signature,
and uses Explorer to launch it under the interactive user's normal token. It
does not rename, patch or re-sign LTK files.

Before launching, cstmSKN preserves the original `settings.json` as
`%APPDATA%\dev.leaguetoolkit.manager\settings.before-cstmskn-tray.json`, sets
`startInTray=true` and `startInTrayUnlessUpdate=false`, and retains other
settings, profiles and selections. It does not accept setup terms, configure
League or turn on LTK's patcher automatically. An existing LTK process is left
alone: another invocation would reveal its window. New launches use LTK's own
hidden startup and system tray. Manually opened windows, Windows permission
prompts and third-party changes cannot be guaranteed hidden.

This feature starts the companion only. LTK has no supported external API for
cstmSKN to synchronize selections or control its Apply/Stop. Use LTK's own
selection and patcher controls. cstmSKN refuses to start its experimental engine
while LTK is running, to avoid competing patchers. Turning the startup toggle
off does not close LTK, disable its patcher, remove its tray preference or stop
a game. Quitting cstmSKN also leaves LTK open.

Reference: [LTK's tray startup implementation](https://github.com/LeagueToolkit/ltk-manager/blob/v1.30.4/src-tauri/src/services/desktop/app.rs).
