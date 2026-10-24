# cstmSKN integration of LeagueToolkit components

cstmSKN is an independent application, not an official or endorsed LeagueToolkit
release. No LeagueToolkit publisher signature is used in this distribution.

The bundled LTK host and DLL derive from LeagueToolkit/ltk-manager commit
`2adda384347dd43e76d6295d77fe1f13623b2808` and are covered by
LTK-PATCHER-LICENSE.md. scripts/prepare-windows-engine.py verifies their original
SHA-256 hashes, retargets the DLL's expected launcher identity from
`ltk-manager.exe` to `cstmSKN.exe`, and removes publisher signatures. It keeps the
verification calls and branches, remaining executable bytes and hook flags
unchanged. The generated provenance records original and derived checksums and
names this modification. This adaptation does not prove game compatibility.

src-tauri/src/windows_shell.rs is adapted from
LeagueToolkit/ltk-manager/src-tauri/src/shell_relaunch.rs at revision
`43782aafd296bceaec4ea2078cb03ecce62fdc9a`, under GPL-3.0-or-later. The normal
Explorer shell launch is retained; the relaunch argument and test examples are
named for cstmSKN, and logging uses cstmSKN's existing stderr approach. LTK-MANAGER-LICENSE.md contains the upstream source license.

Upstream source: https://github.com/LeagueToolkit/ltk-manager
cstmSKN source, including these adaptations: https://github.com/silentrosehill/cstmSKN

The independent native injector prototype is separate and is not included in
this LTK integration branch or build.
