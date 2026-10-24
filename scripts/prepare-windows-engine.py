"""Fetch pinned official LTK files and remove their publisher signature for redistribution.

This is required by the upstream LTK Patcher License, not a patcher modification.
No upstream authentication, game validation, or hook configuration is changed.
"""
from pathlib import Path
import hashlib
import json
import struct
import urllib.request

REVISION = "2adda384347dd43e76d6295d77fe1f13623b2808"
FILES = {
    "ltk_patcher_host.exe": "27de1bfdbf37129e42c12b18cc7b4f75c15d39bcd7afefe65c4c33d0e99fe856",
    "ltk_patcher_dll.dll": "0b024a3a839f55ff7cf7ee93d9ed2078bcbb07d3b7f320463d678f8a6209e5ff",
}
BASE = f"https://raw.githubusercontent.com/LeagueToolkit/ltk-manager/{REVISION}/"
ROOT = Path(__file__).resolve().parents[1]

def remove_publisher_signature(data: bytes) -> bytes:
    """Remove the Authenticode certificate table, leaving executable sections alone."""
    image = bytearray(data)
    if len(image) < 256 or image[:2] != b"MZ":
        raise ValueError("Not a PE executable")
    pe = struct.unpack_from("<I", image, 0x3C)[0]
    if image[pe:pe+4] != b"PE\0\0":
        raise ValueError("Invalid PE header")
    if struct.unpack_from("<H", image, pe+4)[0] != 0x8664:
        raise ValueError("Expected an AMD64 engine")
    optional = pe + 24
    if struct.unpack_from("<H", image, optional)[0] != 0x20B:
        raise ValueError("Expected a PE32+ engine")
    security = optional + 112 + 4 * 8
    offset, size = struct.unpack_from("<II", image, security)
    if size:
        section_count = struct.unpack_from("<H", image, pe+6)[0]
        optional_size = struct.unpack_from("<H", image, pe+20)[0]
        table = optional + optional_size
        sections_end = max((struct.unpack_from("<II", image, table+i*40+16)[0] + struct.unpack_from("<II", image, table+i*40+16)[1] for i in range(section_count)), default=0)
        if offset < sections_end or offset + size > len(image):
            raise ValueError("Certificate overlaps executable data or exceeds file bounds")
        if offset + size == len(image):
            del image[offset:]
        else:
            image[offset:offset+size] = b"\0" * size
    struct.pack_into("<II", image, security, 0, 0)
    struct.pack_into("<I", image, optional+64, 0)  # checksum changed with certificate table
    return bytes(image)

def main():
    target = ROOT / "src-tauri/resources/windows"
    target.mkdir(parents=True, exist_ok=True)
    records = []
    for name, expected in FILES.items():
        with urllib.request.urlopen(BASE + "src-tauri/resources/" + name, timeout=60) as response:
            original = response.read(16 * 1024 * 1024)
        if hashlib.sha256(original).hexdigest() != expected:
            raise ValueError(f"Pinned upstream checksum mismatch: {name}")
        output = remove_publisher_signature(original)
        (target / name).write_bytes(output)
        records.append({"file": name, "upstream_sha256": expected, "redistributed_sha256": hashlib.sha256(output).hexdigest(), "signature": "unsigned; upstream publisher signature removed"})
    license_file = ROOT / "licenses/LTK-PATCHER-LICENSE.md"
    (target / license_file.name).write_bytes(license_file.read_bytes())
    (target / "provenance.json").write_text(json.dumps({"project": "LeagueToolkit/ltk-manager", "revision": REVISION, "files": records}, indent=2) + "\n")
    print("Prepared two pinned Windows engine files without League Toolkit publisher signatures.")

if __name__ == "__main__":
    main()
