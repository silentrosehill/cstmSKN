"""Collect license notices from the resolved Windows build and frontend packages.

Only package name/version/license/repository and license file content are emitted;
local registry, checkout paths and build-user identities are not included.
"""
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
NAMES = ("LICENSE", "LICENCE", "COPYING", "NOTICE", "OFL", "UNLICENSE")

def texts(folder):
    result = []
    for path in sorted(folder.iterdir()):
        if path.is_file() and path.name.upper().startswith(NAMES):
            if path.stat().st_size < 256_000:
                result.append((path.name, path.read_text(encoding="utf-8", errors="replace")))
    return result

def main():
    data = json.loads(subprocess.check_output(["cargo", "metadata", "--manifest-path", str(ROOT / "src-tauri/Cargo.toml"), "--format-version", "1", "--filter-platform", "x86_64-pc-windows-msvc", "--locked"], text=True))
    ids = {node["id"] for node in data["resolve"]["nodes"]}
    notices = ["# cstmSKN Windows third-party notices\n", "The following notices come from the resolved build graph. Some dependencies are build tools rather than runtime components. The LTK binaries are covered separately by LTK-PATCHER-LICENSE.md.\n"]
    manifest = []
    for package in sorted(data["packages"], key=lambda p: (p["name"], p["version"])):
        if package["id"] not in ids:
            continue
        folder = Path(package["manifest_path"]).parent
        entries = texts(folder)
        entry = {"name": package["name"], "version": package["version"], "license": package.get("license"), "repository": package.get("repository")}
        manifest.append(entry)
        notices.append(f'\n## {package["name"]} {package["version"]}\n\nLicense: {package.get("license") or "See source"}\n\nSource: {package.get("repository") or "https://crates.io/crates/" + package["name"]}\n')
        for name, text in entries:
            notices.append(f'\n### {name}\n\n{text}\n')
    for package_json in sorted((ROOT / "node_modules").rglob("package.json")):
        folder = package_json.parent
        try:
            package = json.loads(package_json.read_text())
        except (ValueError, OSError):
            continue
        if "name" not in package or "version" not in package:
            continue
        entries = texts(folder)
        if not entries:
            continue
        notices.append(f'\n## npm: {package["name"]} {package["version"]}\n\nLicense: {package.get("license", "See source")}\n')
        for name, text in entries:
            notices.append(f'\n### {name}\n\n{text}\n')
    for file in [ROOT / "LICENSE", ROOT / "licenses/GPL-3.0.txt"]:
        notices.append(f'\n## cstmSKN / original Zushi: {file.name}\n\n{file.read_text()}\n')
    target = ROOT / "src-tauri/resources/windows"
    target.mkdir(parents=True, exist_ok=True)
    (target / "THIRD-PARTY-NOTICES.md").write_text("\n".join(notices), encoding="utf-8")
    (target / "dependency-licenses.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Generated notices for {len(manifest)} Rust build-graph packages and installed frontend dependencies.")

if __name__ == "__main__": main()
