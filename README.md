<p align="center"><img src="icon.png" width="110" alt="cstmSKN icon" /></p>

# cstmSKN

A personal macOS skin manager with a native glass interface, built on [Zushi](https://github.com/Mouadzz/zushi). Maintained by **silentrosehill**.

[Download the latest release](https://github.com/silentrosehill/cstmSKN/releases/latest)

## Features

- Champion gallery with large skin previews, arrow-key navigation, thumbnails, and chromas.
- Download and select skins directly from the gallery.
- Import `.fantome` and `.zip` custom skins with automatic champion detection, including loose WAD folders.
- One enabled look per champion across regular and custom skins; replacing a look preserves other champions.
- Compact sidebar selection and a full searchable Enabled skins view.
- Native macOS title bar, translucent sidebar, light/dark appearances, and six accent colors.
- Apple Silicon patcher compatibility with the newer League import layout, plus persistent diagnostics.

## Install

Download **cstmSKN-macOS-arm64.zip** from Releases, unzip it, and move **cstmSKN.app** to Applications. The packaged app is for Apple Silicon Macs, uses ad-hoc code signing, and is not Apple notarized.

The patcher requests administrator access through the native macOS dialog. Enter credentials only in that system dialog.

cstmSKN keeps its library and settings separate from the original Zushi app, under the `com.silentrosehill.cstmskn` application-support directory. Libraries are not migrated automatically.

## Use

1. Open League and leave its client running.
2. Download a skin in Champions, or import a custom skin.
3. Select a look, then click **Apply selection** before champion select ends.
4. Use the default skin in the League client. Wait for the patcher to show **Waiting for game**, then start the match.

Changing an enabled look while the patcher is running rebuilds its selection. This is intended for preparing a game, and does not guarantee an immediate visual swap during an existing match.

The sidebar's expand control and **Enabled skins** section open the complete selection. Settings includes themes, storage controls, and a diagnostics disclosure with the local patcher log.

## Build

Requires macOS developer tools, Node.js 22.18 or newer, Rust, and CMake. For Apple Silicon:

```sh
npm ci
cmake -S mod-tools -B mod-tools/build -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64
cmake --build mod-tools/build --parallel
mkdir -p src-tauri/binaries
cp mod-tools/build/mod-tools src-tauri/binaries/mod-tools-aarch64-apple-darwin
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run tauri build -- --bundles app
```

`npm run dev` starts a browser preview; native downloads, imports, and patching require the desktop app.

The standalone Mach-O regression tests can be run with:

```sh
clang++ -std=c++20 mod-tools/tests/macho_imports.cpp -o /tmp/cstmskn-macho-tests
/tmp/cstmskn-macho-tests
```

## Validation

The release passed TypeScript/Vite production compilation, native Rust compilation, 14 selection tests, 7 Rust tests, and code-signature checks. The Mach-O import fix also passed 6 native regression cases and an offline check against the installed game. A user-confirmed test verified that the skin applied in-game. The later interface cleanup retained the same working patcher binary; its live window interactions were not manually verified.

## Credits and license

Based on Zushi by Mouadzz and contributors. The supplied MIT license is retained in [LICENSE](LICENSE); the Rust package retains its upstream GPL-3.0 metadata. Patcher tooling derives from [LeagueToolkit/cslol-manager](https://github.com/LeagueToolkit/cslol-manager). Skin catalog assets use [Alban1911/LeagueSkins](https://github.com/Alban1911/LeagueSkins).

League of Legends and its artwork belong to Riot Games. cstmSKN is not endorsed by or affiliated with Riot Games. Custom skins are used at your own risk.
