Legacy experiment: this engine is no longer built or shipped in cstmSKN’s Windows LTK release.

# cstmSKN native Windows engine

The source-built host/DLL now have an app runtime mode as well as controlled
fixture tests. See [Windows integration and limits](../../WINDOWS.md).

- `--run`: newline-delimited config game/config prefix/start scan/stop protocol.
  Discovers only League of Legends.exe at the exact configured installation.
- `--self-test`: 15 file/access checks in two owned fixture sessions plus
  kill-on-close job cleanup for an owned fixture only.
- `--fixture-protocol-test`: exercises the same runtime protocol using only the
  fixed adjacent fixture and a dedicated cstmSKN-ipc-* temporary directory.
- Arbitrary PID and executable target options are rejected.

Only fixture processes are created or assigned to ownership jobs. The game is
never terminated or put in such a job. The DLL retains itself while import
pointers reference it, disables overlay reads on Stop or owner death, and leaves
original files untouched. Windows code integrity and game protections remain
in force. The unsigned runtime may still be blocked by Smart App Control.

Build/test on Windows x64 with Visual Studio C++ tools and CMake 3.24+:

```powershell
cmake -S native/windows-prototype -B native-build -A x64
cmake --build native-build --config Release
ctest --test-dir native-build -C Release --output-on-failure
```

PowerShell is needed for the load-failure test. The job-list creation API requires
Windows 10+; the app targets Windows 11 x64. Use the integrated app prerelease for
a game attempt. Passing fixtures proves the tested I/O/protocol behavior only;
League compatibility and actual skins still require real in-game validation.

The original native host/DLL sources are GPL-3.0-or-later. Complete text is in
[the GPL license](../../licenses/GPL-3.0.txt) and in packaged notices. They contain
no LTK runtime binaries. The application still uses the open-source LeagueToolkit
overlay builder under its own license.
