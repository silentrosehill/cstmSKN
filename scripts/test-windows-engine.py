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

if __name__ == '__main__': unittest.main()
