<p align="center"><img src="icon.png" width="110" alt="cstmSKN icon" /></p>

# cstmSKN

A personal macOS skin manager with a native glass interface, built on [Zushi](https://github.com/Mouadzz/zushi). Maintained by **silentrosehill**.

[Download the latest release](https://github.com/silentrosehill/cstmSKN/releases/latest)

## Features

- **Favorites** collects starred catalog skins, chromas, and custom imports in one place.
- **Loadouts** saves named sets of skins and mods, restores available items, and identifies missing downloads.
- **Game Mods** imports announcers, champion voices, maps, and other mods as `.fantome`, `.zip`, `.wad`, or `.wad.client` packages.
- Drop packages anywhere in the desktop app, review the detected champion and category, then enable them. Existing imports are never overwritten.
- Champion voice packs and visual skins use separate slots. Maps and announcers each have one global slot; real file conflicts are reported by the overlay builder.
- **Follow champion select** opens your champion’s gallery on lock-in and follows trades and ARAM rerolls. Switch it off in Settings if preferred.
- **Patcher health** checks game files, engine, administrator access, storage, selected files, and session errors, with an option to rebuild temporary patcher data.
- **Settings → Sidebar** shows or hides tabs and saves their order. Drag the handle, use the up/down buttons, or use arrow keys on a focused handle. Settings always stays visible; Reset restores the defaults.
- Each tab has its own accent color. Splash artwork takes over in the gallery, then the tab accent returns. Appearance settings can also keep a fixed color.
- **Software Update** in Settings checks GitHub for signed updates and installs them with Update & Restart.
- **New Releases** automatically lists skins added in the current Riot patch and opens them directly in the gallery.
- Champion browsing with alphabetical sections, an A–Z jump bar, release-date sorting, favorites, and search for champion or skin names.
- Large skin previews, arrow-key navigation, thumbnail filmstrip, chromas, and colored rarity badges from client metadata.
- Portrait loading-screen artwork in Library and Enabled Skins.
- Download and select skins directly from the gallery, or import custom packages with automatic champion detection and an import review.
- One enabled look per champion across regular and custom skins, preserving other champions when replacing a look.
- Resizable sidebar down to an icon rail, colored SF Symbols, and a full searchable Enabled Skins view.
- Untinted native Liquid Glass sidebar on macOS 26+, with sidebar vibrancy on earlier systems; native title bar and refined glass controls.
- Artwork-driven colors in the main content, light/dark appearances, and six manual accent colors.
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

The sidebar’s expand control and **Enabled skins** section open the complete selection. Drag its edge to resize it, or collapse it to icons. **New Releases** checks Riot’s patch data when opened and periodically while visible. The neutral sidebar keeps its appearance as the selected splash changes the main content colors. Settings includes sidebar customization, tab or fixed accents, champion-select integration, patcher health, storage controls, and a diagnostics disclosure with the local patcher log.

## Updates

Open **Settings → Software Update → Check for Updates**. Available updates are downloaded and verified against the embedded public key, including their signed app version, before installation and restart. The release feed is public and requires no GitHub token. Installation is blocked while patching, downloading a skin, importing a custom mod, or reviewing an import. Library data and preferences are preserved outside the app bundle.

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
npm run tauri build -- --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

`npm run dev` starts a browser preview; native downloads, imports, and patching require the desktop app.

The standalone Mach-O regression tests can be run with:

```sh
clang++ -std=c++20 mod-tools/tests/macho_imports.cpp -o /tmp/cstmskn-macho-tests
/tmp/cstmskn-macho-tests
```

## Publish a signed update

Keep the original signing key outside the repository. The public verification key is in `src-tauri/tauri.conf.json`; the app requires signatures bound to the announced app version.

```sh
npm run release:mac -- --key /protected/path/cstmSKN.key --output release
```

The script checks source and bundled application versions, runs the test suites and build, signs the final app bundle, packages the updater archive, and generates its signature and `latest.json`. A sibling `.password` file or `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` supplies a protected key's password. Publish the generated archive, signature, and `latest.json` together on the latest stable GitHub release. GitHub's latest-release endpoint is the configured update feed. Never commit or upload the private key or password.

## Validation

v0.1.21 passed TypeScript/Vite production compilation, native Rust compilation, 50 frontend tests, 13 Rust tests, and code-signature checks. Live catalog checks covered all 173 champions, release dates, skin search, current-patch additions, and representative loading-screen portraits. The native glass bridge resolves AppKit at runtime without strongly linking the new class, retaining its fallback for older macOS versions.

The patcher binary is unchanged from the user-confirmed working release. Its Mach-O import fix previously passed 6 native regression cases and an offline check against the installed game. New coverage includes category coexistence, real archive imports, duplicate import names, legacy metadata migration, loadout restore, local lock-in/trades/rerolls, sidebar preferences, and tab accents. The latest interface was checked through compilation and automated tests; live window interactions and a live champion-select session were not manually verified.

See [ASSETS.md](ASSETS.md) for Apple interface assets and Riot metadata sources.

## Credits and license

Based on Zushi by Mouadzz and contributors. The supplied MIT license is retained in [LICENSE](LICENSE); the Rust package retains its upstream GPL-3.0 metadata. Patcher tooling derives from [LeagueToolkit/cslol-manager](https://github.com/LeagueToolkit/cslol-manager). Skin catalog assets use [Alban1911/LeagueSkins](https://github.com/Alban1911/LeagueSkins).

League of Legends and its artwork belong to Riot Games. cstmSKN is not endorsed by or affiliated with Riot Games. Custom skins are used at your own risk.
