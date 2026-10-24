# cstmSKN for Windows (preview)

cstmSKN's Windows 11 x64 preview uses the LeagueToolkit overlay builder and LTK patcher. The macOS release remains separate.

## Known applying issue

The Windows 1.0.2 preview has a reported LTK DLL refusal:
`host verification failed, refusing overlay: [VRF00000008]`. Attaching to the
game is not proof that an overlay applied. Importing another copy of the DLL
alone does not resolve this refusal. This branch surfaces it as a patcher error,
including when the diagnostic arrives on stderr, and stops that patcher session.
It does not remove LTK verification or establish a working game backend.

An independent, source-built [native injector prototype](native/windows-prototype)
tests DLL loading and read-only file overlays in a child fixture only. It cannot
target League and is not connected to Apply selection. No new game-compatible
engine is released by these changes. Its passing Windows tests do not establish
League or Vanguard compatibility.

## Install and test

1. Download `cstmSKN-Windows-x64-setup.exe` from this project's Windows preview release and install it for your user account. Or, to skip installing, download `cstmSKN-Windows-x64-portable.zip`, extract it anywhere (for example a USB drive), and run `cstmSKN.exe`. Keep the `ltk` folder next to it.
2. Open cstmSKN normally. Do not run it or the League client as administrator. Windows 11's WebView2 runtime is used by the interface.
3. If LTK Manager is already installed, its engine is detected and used in place without copying its signed files. Otherwise the bundled engine is unsigned. You can choose an installed LTK folder in Settings → Windows engine.
4. Confirm the detected League installation, or choose the League folder or its `Game` subfolder. The choice is remembered.
5. First import one known-working original custom `.fantome` mod, choose it, and click Apply selection before launching a fresh Practice Tool match.
6. Check that the status changes from Waiting for game to In game, and that the mod appears. Stop should return the app to Ready.
7. Try Favorites, the Library decks, a second skin for the same champion, custom voice/map imports, and a second fresh match without restarting cstmSKN.

The preview keeps LTK's default validation enabled. If the engine rejects an archive, the app reports that rejection; no mod compatibility, paid-skin-catalog compatibility, or anti-cheat compatibility is guaranteed by an installer build. Do not disable system protections to make this preview run. The cstmSKN installer and bundled fallback engine are currently unsigned, and are not represented as official League Toolkit builds.

Your settings and library are stored under `%APPDATA%\com.silentrosehill.cstmskn`, separately from the Mac. Preview updates are manual from GitHub; the Windows app does not use the macOS updater feed.

## What is shared and what differs

The same galleries, Favorites, compact Library decks, loadouts, custom categories, sidebar customization, and Changelog are shared. Windows uses Lucide icons and Mica where supported. Apple SF Symbol images are excluded from the Windows web build. The Mac engine and native glass bridge stay on the Mac code path.

Windows imports/downloads use a read-only Rust ZIP inspector instead of macOS `unzip`. Colons and other Windows-reserved skin-name characters are encoded on disk while keeping their original display names. The patcher builds an overlay with `ltk_overlay` 0.17.0 and runs the pinned LTK host. It does not edit the original League WADs.

## Engine provenance and licensing

- LeagueToolkit source and resources pinned to commit `2adda384347dd43e76d6295d77fe1f13623b2808` of [ltk-manager](https://github.com/LeagueToolkit/ltk-manager).
- [LTK Patcher License](licenses/LTK-PATCHER-LICENSE.md) covers the host and DLL. The packaging script verifies the upstream SHA-256 hashes, removes League Toolkit's Authenticode signatures as required by the license, and records original and redistributed hashes in `engine-provenance.json`. No patcher validation settings are disabled.
- `ltk_overlay` and its related LeagueToolkit libraries are separate open-source crates; their license notices remain applicable. The original Zushi MIT notice and existing Rust GPL metadata are retained. Generated dependency notices and complete license text ship with the Windows engine resources.
- The older CSLOL DLL is not included in the Windows build. Its separate restrictions are different from the current LTK license.
- Celestial's public repository hosts releases and does not publish reusable application source under an open-source license; no Celestial code or binaries are used.

## Build on Windows

Install Rust stable, Node.js 22+, Python, and Microsoft's C++ build tools. Then:

```powershell
npm ci
python scripts/test-windows-engine.py
python scripts/prepare-windows-engine.py
python scripts/windows-license-notices.py
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
npm run tauri -- build --bundles nsis
```

The installer is under `src-tauri/target/release/bundle/nsis`. The Windows preview workflow runs these checks on a hosted Windows runner and uploads the installer plus provenance/license information. A successful compile does not substitute for the live game checks above.
