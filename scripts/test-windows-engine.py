import importlib.util
from pathlib import Path
import struct
import unittest
spec = importlib.util.spec_from_file_location("engine", Path(__file__).with_name("prepare-windows-engine.py"))
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

class PublisherSignatureTests(unittest.TestCase):
    def fixture(self):
        b = bytearray(768)
        b[:2] = b'MZ'; struct.pack_into('<I', b, 0x3c, 128)
        b[128:132] = b'PE\0\0'; struct.pack_into('<HH', b, 132, 0x8664, 1)
        struct.pack_into('<H', b, 148, 240); struct.pack_into('<H', b, 152, 0x20b)
        struct.pack_into('<II', b, 152+112+32, 736, 32)
        struct.pack_into('<II', b, 152+240+16, 224, 512)
        b[512:736] = b'X' * 224
        return bytes(b)
    def test_only_certificate_directory_checksum_and_certificate_are_changed(self):
        source = self.fixture(); result = engine.remove_publisher_signature(source)
        self.assertEqual(result[512:736], source[512:736]); self.assertEqual(len(result), 736)
        self.assertEqual(struct.unpack_from('<II', result, 152+112+32), (0, 0))
        self.assertEqual(engine.remove_publisher_signature(result), result)
    def test_rejects_certificate_overlapping_executable(self):
        source = bytearray(self.fixture()); struct.pack_into('<II', source, 152+112+32, 520, 32)
        with self.assertRaises(ValueError): engine.remove_publisher_signature(source)
    def test_rejects_invalid_file_or_architecture(self):
        with self.assertRaises(ValueError): engine.remove_publisher_signature(b'bad')
        source = bytearray(self.fixture()); struct.pack_into('<H', source, 132, 0x14c)
        with self.assertRaises(ValueError): engine.remove_publisher_signature(source)

class LauncherIdentityTests(unittest.TestCase):
    def fixture(self):
        # A small PE section table with the pinned layout, not an executable.
        b = bytearray(engine.LAUNCHER_NAME_OFFSET + 64)
        struct.pack_into('<I', b, 0x3c, 128)
        struct.pack_into('<H', b, 128 + 6, 2)
        struct.pack_into('<H', b, 128 + 20, 240)
        table = 128 + 24 + 240
        struct.pack_into('<III', b, table + 12, 0x1000, 0x87200, 0x400)
        struct.pack_into('<III', b, table + 40 + 12, 0x89000, 0x41200, 0x87600)
        literal = engine.LAUNCHER_NAME_OFFSET
        instruction = engine.LAUNCHER_LENGTH_OFFSET
        b[literal:literal + len(engine.OLD_LAUNCHER)] = engine.OLD_LAUNCHER
        b[instruction:instruction + 6] = bytes.fromhex('41 b9 0f 00 00 00')
        lea = instruction - 12
        b[lea:lea + 3] = bytes.fromhex('4c 8d 05')
        displacement = (0x89000 + literal - 0x87600) - (0x1000 + lea - 0x400 + 7)
        struct.pack_into('<i', b, lea + 3, displacement)
        return bytes(b)
    def test_retargets_identity_without_removing_verification_or_touching_other_code(self):
        source = self.fixture()
        result = engine._retarget_known_layout(source)
        name, length = engine.LAUNCHER_NAME_OFFSET, engine.LAUNCHER_LENGTH_OFFSET
        self.assertEqual(result[name:name + 11], b'cstmSKN.exe')
        self.assertEqual(struct.unpack_from('<I', result, length + 2)[0], 11)
        allowed = set(range(name, name + 15)) | set(range(length + 2, length + 6))
        self.assertEqual(len(source), len(result))
        self.assertTrue(all(a == b or i in allowed for i, (a, b) in enumerate(zip(source, result))))
        self.assertEqual(source[length - 12:length], result[length - 12:length])
    def test_refuses_unknown_build_even_if_the_layout_looks_compatible(self):
        with self.assertRaisesRegex(ValueError, 'exact pinned'):
            engine.retarget_launcher(self.fixture())
    def test_refuses_layout_drift_in_name_length_or_reference(self):
        for position in [engine.LAUNCHER_NAME_OFFSET, engine.LAUNCHER_LENGTH_OFFSET,
                         engine.LAUNCHER_LENGTH_OFFSET - 12, engine.LAUNCHER_LENGTH_OFFSET - 9]:
            source = bytearray(self.fixture())
            source[position] ^= 1
            with self.assertRaises(ValueError):
                engine._retarget_known_layout(source)

if __name__ == '__main__': unittest.main()
