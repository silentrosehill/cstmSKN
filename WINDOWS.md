# cstmSKN for Windows — LTK integration candidate

This branch builds a self-contained Windows 11 x64 preview using LeagueToolkit's
open-source overlay builder and a clearly identified cstmSKN-derived LTK runtime.
It does not require LTK Manager to be installed, running or visible. No manual
DLL import is needed. The independent injector prototype is paused and is not
part of this build. The macOS engine is unchanged.

**In-game compatibility is not yet verified.** Windows build and protocol tests
cannot prove that skins apply in a real game.

## What changed

The previous preview could attach to League and then silently fail when the DLL
reported `host verification failed, refusing overlay: [VRF00000008]`.

The pinned DLL expects `ltk-manager.exe` in its launcher verification. The
packaging script adapts that expected identity to our real `cstmSKN.exe`, keeping
the surrounding verification and every other executable byte unchanged, apart
from the required publisher-signature/checksum removal. It refuses to modify
an unknown binary or an unexpected code/data layout, records original and
derived hashes, and verifies the complete modification boundary.

The desktop shell-launch adapter is reused from LTK's GPL source so Windows
launches cstmSKN through the normal Explorer shell, including when an installer
or another app started it. This does not rename cstmSKN to LTK Manager or spoof a
process identity. The installed LTK Manager and its settings/files are untouched.
The app now uses its bundled derived runtime instead of selecting an installed
LTK DLL with different launcher expectations. Runtime SHA-256 checks reject
missing, replaced or stale engine files before they can be started.

Host-verification errors now reach the interface from either output stream and
stop the affected session. The patcher keeps its existing validation flags;
this integration does not opt out of archive checks or add a game-integrity or
Vanguard bypass.

## Test the candidate

1. Extract the candidate's portable ZIP and keep the `ltk` folder beside
   `cstmSKN.exe`, or install the candidate installer. Use the candidate artifacts,
   not the older published 1.0.2 preview.
2. Close LTK Manager and any other patcher so two engines cannot compete. Open
   cstmSKN from its normal shortcut or executable.
3. Confirm the League installation. Import the same known-working custom
   `.fantome` used successfully with official LTK Manager, select it, then Apply
   selection before starting a fresh Practice Tool game.
4. Check the actual skin in-game, not just the status bar. If it fails, copy the
   patcher diagnostics, especially any `VRF` code. Do not change system
   protections or engine validation settings to make it pass.
5. Test Stop, then a second fresh match and a changed selection. Originals must
   remain unchanged and errors must remain visible.

The installer and derived runtime are currently unsigned. Administrator mode is
only needed when League itself runs elevated; the existing engine-elevation
setting remains available. The application and library use
`%APPDATA%\com.silentrosehill.cstmskn`. Candidate builds are not published as a
working game update until tested.

## Source and licenses

- LTK host/DLL upstream: `LeagueToolkit/ltk-manager` at
  `2adda384347dd43e76d6295d77fe1f13623b2808`.
- Binary reuse/modification: [LTK Patcher License](licenses/LTK-PATCHER-LICENSE.md).
  The upstream publisher signatures are removed; cstmSKN does not claim official
  affiliation or endorsement.
- GPL desktop shell adapter source: revision
  `43782aafd296bceaec4ea2078cb03ecce62fdc9a`, with the complete
  [upstream GPL license](licenses/LTK-MANAGER-LICENSE.md) and
  [modification notice](licenses/LTK-INTEGRATION-NOTICE.md).
- `ltk_overlay` and other library licenses are included in the generated notices.
  The original Zushi notice remains. No Celestial code is used.
- Build attestation for LTK's hosted patcher delivery is distinct from local
  launcher verification. This candidate does not use official release credentials
  or claim access to that delivery service.

## Build on Windows

Install Rust stable, Node.js 22+, Python and Microsoft's C++ build tools.

```powershell
npm ci
python scripts/prepare-windows-engine.py
python scripts/test-windows-engine.py
python scripts/windows-license-notices.py
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
npm run tauri -- build --bundles nsis
```

The Windows workflow uploads the installer, portable ZIP, notices and runtime
provenance. Preparing engine resources is reproducible from their pinned hashes;
unknown upstream releases fail closed rather than receiving a guessed patch.
