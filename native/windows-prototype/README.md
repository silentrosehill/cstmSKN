# Native Windows injector prototype — fixture only

This is cstmSKN's own small Windows x64 host, DLL and test executable, built from
source. It contains no LTK binaries or code and is not a working League backend.
It cannot discover or target League or an arbitrary PID. The DLL accepts only
the child fixture beside it; the host accepts only `--self-test`.

The host creates its own unshown test window process and uses Windows'
`SetWindowsHookExW` interface to load the DLL into that child. The DLL changes
only that fixture's `CreateFileW`/`CreateFileA` import slots. Reads of matching
`.wad.client` files under the test root can resolve to a separate overlay;
write requests, other files, missing replacements and paths outside that root
pass through unchanged. The original assets are never edited.

The self-test exercises actual cross-process loading and file reads, then
disables the overlay, removes the window hook, verifies the original file is
read again and closes the child. The DLL pins itself before changing import
pointers, so removing the window hook cannot leave dangling function pointers.
Two consecutive independent sessions exercise cleanup and restart.

## Build and test on Windows

Requires Visual Studio C++ build tools, the Windows SDK and CMake 3.24+.

```powershell
cmake -S native/windows-prototype -B native-build -A x64
cmake --build native-build --config Release
ctest --test-dir native-build -C Release --output-on-failure
```

The three runtime files must remain together. Running
`cstm-injector-prototype.exe --self-test` creates temporary fixture assets,
prints its results and cleans up. It does not use your installed game or mods.

## Limits

Passing these tests proves only fixture behavior. It does not prove that the
DLL can be loaded into League, that League uses these import slots, or that its
asset validation will accept an overlay. There is no Vanguard manipulation,
game-integrity bypass, third-party host-verification patch or LTK impersonation.
The prototype is not wired to Apply selection and is not a replacement for a
supported game patcher. No new game-compatible engine has been released.

For the current LTK approach, importing its DLL alone does not establish a
working backend: that DLL still requires its host/configuration and accepts or
rejects the runtime independently. The official Manager supports tray startup,
but its public install links are not an API to remotely select/start/stop mods.
A seamless background companion needs reliable integration beyond simply
starting its process; this prototype does not pretend to implement that.

These original prototype sources are distributed under cstmSKN's GPL-3.0 license.
