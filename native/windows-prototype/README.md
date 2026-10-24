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

The fixture is now assigned to a private Windows job as part of process
creation, before its first thread runs. Closing the owner's last job handle
terminates that child; a third test session exercises this with its overlay
active. The job handle is not inherited. There is no gap between creating the
child and assigning job ownership. This mechanism applies only to our fixture;
it must not be used to bind or terminate an independently running game.

Overlay selection is conservative about file access: `MAXIMUM_ALLOWED` and
special delete/reparse/backup opens retain the original operation. If a
replacement exists but cannot be opened, the original file is tried, and only
successful replacement opens count as redirects. Windows last-error values are
preserved across temporary string cleanup and captured at the failing host API
instead of being read after unrelated cleanup.

The real fixture exercises 15 read/access conditions, including locked-overlay
fallback in both APIs, writable access that changes only the original test file,
Unicode filenames, files present only in the overlay, and missing-file error
codes. A separate missing-DLL startup test verifies the original Windows error
126 survives cleanup and that no child remains. DLL initialization failures
include a reason and numeric error through the versioned shared protocol.

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
CTest also needs PowerShell (`pwsh` or Windows PowerShell) for the missing-DLL
failure scenario. The job-list creation API requires Windows 10 or later; the
application's Windows target remains Windows 11 x64.

## Limits

Passing these tests proves only fixture behavior. It does not prove that the
DLL can be loaded into League, that League uses these import slots, or that its
asset validation will accept an overlay. There is no Vanguard manipulation,
game-integrity bypass, third-party host-verification patch or LTK impersonation.
The prototype is not wired to Apply selection and is not a replacement for a
supported game patcher. No new game-compatible engine has been released.
These binaries are unsigned. An independent DLL is subject to the same Windows
code-integrity policy as other DLLs; this prototype does not solve the reported
Smart App Control signing block. Path checks are lexical and are not a security
boundary against hostile reparse points or concurrent filesystem changes.

For the current LTK approach, importing its DLL alone does not establish a
working backend: that DLL still requires its host/configuration and accepts or
rejects the runtime independently. The official Manager supports tray startup,
but its public install links are not an API to remotely select/start/stop mods.
A seamless background companion needs reliable integration beyond simply
starting its process; this prototype does not pretend to implement that.

These original prototype sources are distributed under GPL-3.0-or-later. The
complete license text is in [the repository's GPL license](../../licenses/LTK-MANAGER-LICENSE.md)
and included as `LICENSE.txt` in the CI test artifact. This does not change the
separate licenses of cstmSKN, Zushi, or LTK components.
