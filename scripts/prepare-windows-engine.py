"""Build cstmSKN's explicitly derived LTK runtime from pinned upstream binaries.

The launcher-name check is retargeted to cstmSKN.exe, not removed. All other
executable bytes stay unchanged. Publisher signatures are removed under the LTK
Patcher License. This does not establish game compatibility.
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

# These offsets are specific to FILES["ltk_patcher_dll.dll"]. The input hash is
# checked before interpreting them. Unknown releases must never be patched.
LAUNCHER_NAME_OFFSET = 0x88D77
LAUNCHER_LENGTH_OFFSET = 0x1CB57
OLD_LAUNCHER = b"ltk-manager.exe"
NEW_LAUNCHER = b"cstmSKN.exe"

def retarget_launcher(data: bytes) -> bytes:
    """Keep verification, but verify our actual launcher identity in our own build."""
    if hashlib.sha256(data).hexdigest() != FILES["ltk_patcher_dll.dll"]:
        raise ValueError("Launcher adaptation requires the exact pinned upstream DLL")
    return _retarget_known_layout(data)

def _retarget_known_layout(data: bytes) -> bytes:
    # The length instruction is mov r9d, 15 immediately after the RIP-relative
    # reference to this literal, in the host-verification code. Do not alter the
    # branch, verification function, WAD checks, hook flags or any other code.
    name = LAUNCHER_NAME_OFFSET
    instruction = LAUNCHER_LENGTH_OFFSET
    if data[name:name + len(OLD_LAUNCHER)] != OLD_LAUNCHER:
        raise ValueError("Unexpected launcher literal")
    if data[instruction:instruction + 6] != b"\x41\xb9\x0f\0\0\0":
        raise ValueError("Unexpected launcher-name length instruction")
    # Check the LEA really points at the literal in this pinned PE layout.
    lea = instruction - 12
    if data[lea:lea + 3] != b"\x4c\x8d\x05":
        raise ValueError("Unexpected launcher reference")
    displacement = struct.unpack_from("<i", data, lea + 3)[0]
    pe = struct.unpack_from("<I", data, 0x3c)[0]
    count = struct.unpack_from("<H", data, pe + 6)[0]
    optional_size = struct.unpack_from("<H", data, pe + 20)[0]
    table = pe + 24 + optional_size
    def rva(offset):
        for index in range(count):
            header = table + index * 40
            address, size, start = struct.unpack_from("<III", data, header + 12)
            if start <= offset < start + size:
                return address + offset - start
        raise ValueError("Launcher reference is outside PE sections")
    if rva(lea) + 7 + displacement != rva(name):
        raise ValueError("Launcher reference does not target the expected literal")
    image = bytearray(data)
    image[name:name + len(OLD_LAUNCHER)] = NEW_LAUNCHER.ljust(len(OLD_LAUNCHER), b"\0")
    struct.pack_into("<I", image, instruction + 2, len(NEW_LAUNCHER))
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
        derived = retarget_launcher(original) if name == "ltk_patcher_dll.dll" else original
        output = remove_publisher_signature(derived)
        # Prove that redistribution changed only the two identity fields,
        # apart from signature/checksum removal. Fail closed on any extra edit.
        baseline = remove_publisher_signature(original)
        allowed = set(range(LAUNCHER_NAME_OFFSET, LAUNCHER_NAME_OFFSET + len(OLD_LAUNCHER))) | set(range(LAUNCHER_LENGTH_OFFSET + 2, LAUNCHER_LENGTH_OFFSET + 6)) if name == "ltk_patcher_dll.dll" else set()
        if len(output) != len(baseline) or any(a != b and i not in allowed for i, (a, b) in enumerate(zip(baseline, output))):
            raise ValueError("Unexpected modification outside cstmSKN launcher identity")
        (target / name).write_bytes(output)
        records.append({"file": name, "upstream_sha256": expected, "redistributed_sha256": hashlib.sha256(output).hexdigest(), "signature": "unsigned; upstream publisher signature removed", "modifications": ["launcher verification expects cstmSKN.exe instead of ltk-manager.exe; verification remains active"] if name == "ltk_patcher_dll.dll" else []})
    license_file = ROOT / "licenses/LTK-PATCHER-LICENSE.md"
    (target / license_file.name).write_bytes(license_file.read_bytes())
    for notice in ["LTK-MANAGER-LICENSE.md", "LTK-INTEGRATION-NOTICE.md"]:
        (target / notice).write_bytes((ROOT / "licenses" / notice).read_bytes())
    (target / "provenance.json").write_text(json.dumps({"project": "LeagueToolkit/ltk-manager", "revision": REVISION, "files": records}, indent=2) + "\n")
    print("Prepared the unsigned cstmSKN-derived LTK runtime; launcher verification targets cstmSKN.exe.")

if __name__ == "__main__":
    main()
