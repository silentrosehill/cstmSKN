// Standalone regression test: clang++ -std=c++20 tests/macho_imports.cpp -o macho-imports-test
#include <cassert>
#include <iostream>
#include <stdexcept>
#include "../lib/patcher/utility/macho.hpp"
using lol::MachO;
std::vector<unsigned char> fixture(std::uint32_t symbol_index=0, std::uint32_t str_index=1) {
  std::vector<unsigned char> bytes(1024);
  std::size_t pos=0;
  auto write=[&](auto value){std::memcpy(bytes.data()+pos,&value,sizeof(value));pos+=sizeof(value);};
  write(MachO::Header{0xfeedfacf,0x100000c,0,2,3,256,0,0});
  write(MachO::Command{0x19,152});
  MachO::Segment seg{}; std::strcpy(seg.segname,"__DATA_CONST");seg.vmaddr=0x100020000;seg.vmsize=0x1000;seg.fileoff=512;seg.filesize=16;seg.nsects=1;write(seg);
  MachO::Section sec{};std::strcpy(sec.sectname,"__got");std::strcpy(sec.segname,"__DATA_CONST");sec.addr=0x100020040;sec.size=16;sec.offset=512;sec.flags=6;sec.reserved1=1;write(sec);
  write(MachO::Command{2,24});write(MachO::Symtab{576,1,608,16});
  write(MachO::Command{0xb,80});MachO::Dysymtab ds{};ds.indirectsymoff=640;ds.nindirectsyms=3;write(ds);
  pos=576;write(MachO::Symbol{str_index,1,0,0,0});
  std::memcpy(bytes.data()+609,"_fopen",7);
  pos=640;write(std::uint32_t(0x80000000));write(symbol_index);write(std::uint32_t(0x40000000));
  return bytes;
}
int main() {
  {
    auto bytes=fixture();MachO m;m.parse_data_arm64(bytes.data(),bytes.size());
    assert(m.find_import_ptr("_fopen")==0x100020040); // reserved1 offset honored
    assert(m.find_import_ptr("_missing")==0);
  }
  for (auto index : {std::uint32_t(0x80000000),std::uint32_t(0x40000000),std::uint32_t(99)}) {
    auto bytes=fixture(index);MachO m;m.parse_data_arm64(bytes.data(),bytes.size());
    assert(m.find_import_ptr("_fopen")==0); // local, absolute and invalid indices skipped
  }
  {
    auto bytes=fixture(0,999);MachO m;m.parse_data_arm64(bytes.data(),bytes.size());
    assert(m.find_import_ptr("_fopen")==0); // bad string offset never read
  }
  {
    auto bytes=fixture();bytes.resize(650);MachO m;bool failed=false;
    try {m.parse_data_arm64(bytes.data(),bytes.size());} catch(std::runtime_error const&){failed=true;}
    assert(failed); // truncated indirect table rejected
  }
  std::cout<<"6 Mach-O import regression cases passed\n";
}
