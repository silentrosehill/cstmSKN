"""Include the complete, byte-for-byte official release artifact, never extracted DLLs."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import os
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.30.4"
NAME = "LTK.Manager_1.30.4_x64-setup.exe"
SHA256 = "0007230f8772c846d586f456aedee5846f7dbf4719715940e73bb073ae4eff23"
URL = f"https://github.com/LeagueToolkit/ltk-manager/releases/download/v{VERSION}/{NAME}"
DEST = ROOT / "src-tauri/resources/ltk-companion"
DEST.mkdir(parents=True, exist_ok=True)
installer = DEST / NAME
if not installer.exists() or hashlib.sha256(installer.read_bytes()).hexdigest() != SHA256:
    request = urllib.request.Request(URL, headers={"User-Agent": "cstmSKN-build"})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read(32 * 1024 * 1024 + 1)
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise SystemExit("Official LTK installer hash mismatch; nothing was packaged")
    pending = installer.with_suffix(".tmp")
    pending.write_bytes(data)
    pending.replace(installer)

manifest = {
    "version": VERSION,
    "artifact": NAME,
    "sha256": SHA256,
    "sourceUrl": URL,
    "correspondingSource": f"https://github.com/LeagueToolkit/ltk-manager/archive/refs/tags/v{VERSION}.zip",
    "unmodifiedOfficialArtifact": True,
}
(DEST / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
shutil.copyfile(ROOT / "licenses/LTK-MANAGER-LICENSE.md", DEST / "LTK-MANAGER-LICENSE.txt")
(DEST / "ABOUT.md").write_text(f"""# Official LTK Manager installer

This folder contains the complete unmodified official LTK Manager {VERSION}
Windows release artifact. Its SHA-256 is `{SHA256}`. cstmSKN does not extract,
rename, modify or re-sign LTK's patcher binaries or claim affiliation with LTK.

Original download: {URL}
Corresponding source and build instructions (GPL-3.0-or-later):
https://github.com/LeagueToolkit/ltk-manager/tree/v{VERSION}
Source archive: {manifest['correspondingSource']}
Full GPL text accompanies this file. Patcher binaries have the separate license:
https://github.com/LeagueToolkit/ltk-manager/blob/v{VERSION}/LTK-PATCHER-LICENSE.md

Use cstmSKN’s first-run setup or Settings → LTK patcher → Install LTK Manager to run this official
installer. Windows and initial LTK setup remain visible. cstmSKN builds the selected overlay and controls the installed LTK patcher
host through its stdin/stdout protocol, without a separate Manager window.
""", encoding="utf-8")
(DEST / "patcher-integration.json").write_text(json.dumps({
    "patcher": "Official installed LTK host and DLL",
    "directRuntimeFilesBundled": False,
    "managerWindowRequired": False,
    "protocol": "stdin/stdout config/start/stop",
    "hookFlags": 4,
    "architectureReference": "https://github.com/Alban1911/Rose/blob/12a0d46bfc63387a39479f395e2724b324d3d095/injection/overlay/overlay_manager.py",
}, indent=2) + "\n", encoding="utf-8")
print(f"Prepared complete official LTK {VERSION} installer; SHA-256 verified, no binary modifications.")

if "--test-fixture" in sys.argv:
    # CI reads the real signed executable's resources and trust chain. This
    # extracted test input stays outside app resources and is never packaged.
    sevenzip = shutil.which("7z") or str(Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "7-Zip/7z.exe")
    fixture = ROOT / "native-build/ltk-official-fixture"
    fixture.mkdir(parents=True, exist_ok=True)
    subprocess.run([sevenzip, "x", "-y", f"-o{fixture}", str(installer), "ltk-manager.exe", "ltk_patcher_host.exe", "ltk_patcher_dll.dll"], check=True)
