# cstmSKN 0.1.24 audit

This is a focused source, dependency, and release-artifact audit, not a guarantee that the app has no remaining defects. The release keeps the established sidebar appearance and existing application-data identifier.

## Bugs and safety fixes

- Downloads previously buffered entire packages in RAM and wrote directly to the final filename. They now stream to a temporary file, enforce a 1 GB compressed-size limit and request timeout, check the ZIP central directory, flush to disk, and atomically replace the installed package only after success. Interrupted and invalid files do not replace an existing skin. Batch progress counts attempts and reports failures.
- Champion/skin path components now reject dot traversal, controls, ambiguous percent encoding, and backslashes. K/DA-style slash encoding remains compatible with existing libraries. Mutations are serialized, directory symlinks are rejected, and downloads accept only the existing HTTPS catalog location without redirects.
- The engine additionally rejects absolute paths, raw parent traversal, Windows-style paths, and extraction through existing symlinks. These checks also protect against an archive changed after import.
- An older asynchronous library refresh can no longer overwrite a newer list. Installed-skin checks use an indexed set. A failed deletion propagates to its confirmation view and preserves the active selection for the failed item.
- Patcher status polling no longer overlaps requests. An error keeps Stop available and updates blocked until the patcher is stopped. Stop waits for process termination, escalating if necessary, before reporting Ready. Temporary-data cleanup returns real errors instead of pretending to succeed.
- Invalid saved loadouts, champion favorites, and champion assignments are sanitized. Disabled/full storage no longer throws through selection, favorite, setup, or sidebar actions. If storage cannot be written, changes work for the current session but cannot be guaranteed across restarts.
- Storage cleanup handles partial successes independently and shows failures. Notification timers no longer restart on unrelated parent renders, and animation/timer callbacks are cleaned up.
- The administrator relaunch fallback quotes shell arguments and passes the original user-home argument consistently.
- Production content security policy now restricts remote connections/assets and blocks remote scripts, embedded frames, and objects. Unused shell execution/spawn/open permissions were removed. Native browser opening accepts secure web links only. This follows [Tauri's CSP guidance](https://v2.tauri.app/security/csp/).

## Optimizations

Catalog tree and chroma lookups share in-flight requests instead of making duplicates during concurrent renders. Failed chroma lookups remain retryable. The artwork palette cache is bounded to 80 entries and failed lookups are removed so they can retry. Secondary views load on demand; the main production JavaScript chunk decreased from roughly 552 kB to 510 kB before compression. No live frame-rate or startup-time benchmark was performed.

## Identity and credentials

The previous app and engine embedded developer home/source paths. The new release remaps compiler paths, and the production sidecar fallback no longer embeds the development checkout. Both final executables are checked for local home-directory traces before publication.

Hardcoded personal profile labels were replaced by the app name. Scans of tracked source and release contents found no matching private signing keys, GitHub token patterns, AWS access-key patterns, or developer home/name literals. Pattern scans cannot detect every possible secret. PNG metadata was inspected: SF Symbol EXIF contains pixel dimensions, not author/location information. The apparent email match inside an icon was compressed binary data, not a metadata field.

The GitHub handle remains in the repository/update URLs and stable bundle identifier. Removing these would break the existing update feed or move users to a different data directory. Public Git commit identities use GitHub noreply addresses. The local League client token remains inside the native loopback client and is not returned to the UI or deliberately logged.

**Historical scope:** existing public commits and older release assets were not rewritten or deleted. Older app binaries contain the previous build-path traces, and older source revisions contain the profile label. This release cleans the current source and newly published artifacts; it does not erase historical public copies or GitHub account association.

## Dependencies and remaining limitations

`npm audit` initially reported 9 affected packages (6 high, 1 moderate, 2 low). Compatible updates reduced the complete npm dependency audit to zero known vulnerabilities at audit time.

The full Rust lockfile initially had 14 vulnerability advisories. Compatible Rust updates removed 11. Three advisories remain for `zip` 4.6.1, pulled by the updater's **Windows-only** dependency: [RUSTSEC-2026-0367](https://rustsec.org/advisories/RUSTSEC-2026-0367.html), [0368](https://rustsec.org/advisories/RUSTSEC-2026-0368.html), and [0369](https://rustsec.org/advisories/RUSTSEC-2026-0369.html). Cargo's dependency tree confirms `zip` is absent for `aarch64-apple-darwin`. Do not interpret the macOS release as validation of a Windows build.

The cross-platform lockfile also reports Linux-only `glib` [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) and an unmaintained `proc-macro-error` build dependency [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html). No advisories were hidden or ignored to make the audit appear clean. The vendored C/C++ engine and its pinned dependencies are not covered by npm/cargo-audit; source review and regression fixtures do not substitute for a complete native security audit.

The app still runs its native process with administrator privileges for patching. CSP, path checks, and reduced webview permissions are hardening, not a replacement for separating the UI and a minimal privileged helper. Imported mods should still be treated as untrusted data. The app remains ad-hoc signed and not Apple notarized.

## Verification

- 59 frontend tests, including unavailable/full storage and corrupted saved records.
- 18 Rust tests, including path/URL validation, symbolic-link rejection, failed/truncated-download preservation, and successful atomic replacement.
- Six native Mach-O import regression cases.
- Six actual engine import fixtures: five malicious paths rejected and a valid archive accepted.
- Read-only scan of the installed League binary: expected ARM64 verification signature and `_fopen` import/stub found.
- Production web/native builds; app bundle and updater archive signature/version validation; tampered archive rejection; final artifact privacy scans and remote asset checksum comparison.

A live game, live native window interactions, and a full updater installation were not manually exercised. New upstream advisories and patches may change these findings after publication.
