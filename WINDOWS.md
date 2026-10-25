# cstmSKN Windows — LTK background patching

The Windows app uses the official installed LTK patcher to apply the skin and
custom-mod selection made in cstmSKN. Apply builds a WAD overlay with the
open-source LeagueToolkit overlay builder and starts `ltk_patcher_host.exe`
in the background. Stop controls that same process. The experimental cstmSKN
injector is no longer built, loaded or bundled. The Mac patcher is unchanged.

## First launch

The first Windows launch shows a setup dialog with **Install LTK Manager**.
The complete, unmodified official LTK Manager 1.30.4 installer is included in
both cstmSKN downloads. Finish the normal Windows installer and click **Check
installation**, then **Continue to cstmSKN**. If LTK is already installed, its
original signed host/DLL are checked and setup can be skipped. The dialog can
also be dismissed with **Set up later**; installation remains in Settings.

Only installing the LTK components is required. You select skins in cstmSKN;
a separate LTK Manager window is not needed for cstmSKN's patching. The first
setup prompt also appears once for users upgrading from the old experimental
engine, so the change is visible.

## Apply and Stop

1. Quit the previous cstmSKN version and install this build (or extract the
   portable ZIP into a fresh folder).
2. Confirm the League game directory in cstmSKN. Download/select a known-working
   skin or custom mod and click **Apply selection** before a fresh Practice Tool
   match. Wait for **Waiting for game** before starting the match.
3. cstmSKN builds the selected overlay, verifies the original installed LTK
   host/DLL signatures and launches the host in its own installation folder.
   It sends `config loglevel 16`, `config flags 4`, the overlay prefix and
   `start scan` through stdin, and monitors stdout/stderr acknowledgements.
4. The LTK host reports scanning, attachment, overlaying and game exit. cstmSKN
   displays those acknowledgements and preserves failures. This is actual host
   control, not a launcher for the Manager UI or a file-import handoff.
5. **Stop** sends the host's stop command and closes its input. Only cstmSKN's
   own child process is stopped if it does not exit. The app never kills all
   LTK processes, the Manager, the game or unrelated patchers.

The command flow follows [Rose's background LTK integration](https://github.com/Alban1911/Rose/blob/12a0d46bfc63387a39479f395e2724b324d3d095/injection/overlay/overlay_manager.py).
Flag 4 is the LTK custom-skin option Rose uses. cstmSKN does not modify LTK's
binary contents or code signatures, spoof its launcher identity, change its
expiry date, or change Windows security policy.

A running Manager window does not block Apply. Avoid starting a second patching
session in another tool: cstmSKN owns and controls only its own LTK host. Use a
fresh match when changing already loaded cosmetics. In-game skin compatibility
still needs testing on an actual Windows League installation; CI has no game.

## Official installer and signatures

The `ltk-companion` resource folder contains the complete original installer,
its pinned SHA-256 provenance, full GPL text and corresponding-source directions.
The installer hash and Windows Authenticode trust are verified before opening
it. The installed LTK components are used in place; loose patcher DLLs and hosts
are not copied into or redistributed with cstmSKN. Windows installation approval
prompts remain visible. Installing cstmSKN does not silently install LTK.

[Official release](https://github.com/LeagueToolkit/ltk-manager/releases/tag/v1.30.4)
· [Corresponding source](https://github.com/LeagueToolkit/ltk-manager/tree/v1.30.4)
· [Patcher license](https://github.com/LeagueToolkit/ltk-manager/blob/v1.30.4/LTK-PATCHER-LICENSE.md)

Native registry, version-resource, process and WinVerifyTrust APIs handle
installation checks. Trust errors include their Windows code. A Windows refusal,
LTK host rejection, expired patcher or rejected overlay remains an error; no
operating-system or game protection bypass is added by cstmSKN. Administrator
rights do not substitute for a trusted signature.

## Build and validation

```powershell
npm ci
python scripts/prepare-ltk-companion.py --test-fixture
python scripts/windows-license-notices.py
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
npm run tauri -- build --bundles nsis
```

Windows tests validate the actual signed official executable and registry
entries with Unicode paths. Production command/configuration helpers start the
actual official host twice, require its scanning acknowledgement, send Stop and
require a clean exit. No game is touched. A separate host-protocol probe also
checks the unchanged official host/DLL. Packaging verifies the complete official
installer inside both NSIS and portable archives and excludes the old native
runtime. Those checks do not establish real game attachment or skin appearance.
