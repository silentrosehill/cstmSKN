"""Build cstmSKN's own Windows runtime from source; no LTK binary download."""
from pathlib import Path
import hashlib, json, shutil, subprocess, sys
root = Path(__file__).resolve().parents[1]
if sys.platform != "win32":
    raise SystemExit("Build the native Windows engine on Windows x64")
build = root / "native-build"
subprocess.run(["cmake", "-S", str(root / "native/windows-prototype"), "-B", str(build), "-A", "x64"], check=True)
subprocess.run(["cmake", "--build", str(build), "--config", "Release"], check=True)
subprocess.run(["ctest", "--test-dir", str(build), "-C", "Release", "--output-on-failure"], check=True)
target = root / "src-tauri/resources/windows"
if target.exists():
    shutil.rmtree(target)
target.mkdir(parents=True)
files = {}
for original, name in [("cstm-injector-prototype.exe", "cstm-native-host.exe"), ("cstm-overlay-prototype.dll", "cstm-native-overlay.dll")]:
    shutil.copy2(build / "Release" / original, target / name)
    files[name] = hashlib.sha256((target / name).read_bytes()).hexdigest()
shutil.copy2(root / "licenses/GPL-3.0.txt", target / "LICENSE.txt")
manifest = {"engine": "cstmSKN native injector", "protocolVersion": 3, "source": "native/windows-prototype", "files": files, "signed": False}
(target / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print("Built and tested source-native host/DLL; prepared app resources with exact SHA-256 hashes.")
