# cstmSKN Windows — integrated source-native injector preview

This branch connects the source-built native host/DLL to cstmSKN’s actual
Apply selection and Stop actions. The app builds cosmetic WAD overlays with the
open-source LeagueToolkit overlay builder and starts its own runtime. No LTK
Manager or LTK host/DLL binaries are bundled or launched by this build.

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
