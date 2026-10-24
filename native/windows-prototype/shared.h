#pragma once
#include <windows.h>
#include <string>

// This protocol is deliberately restricted to our own child fixture. There is
// no PID argument, game discovery, or connection to the League patcher path.
namespace cstm {
constexpr DWORD protocol_version = 2;
constexpr UINT test_reads = WM_APP + 31;
constexpr UINT test_stopped = WM_APP + 32;
constexpr UINT test_before = WM_APP + 33;
constexpr wchar_t fixture_class[] = L"CstmSKNInjectorFixture";
constexpr wchar_t fixture_name[] = L"cstm-injector-fixture.exe";
constexpr LONG expected_results = 0x7fff;

struct Shared {
    DWORD version;
    DWORD size;
    DWORD pid;
    volatile LONG enabled;
    volatile LONG ready; // 0: pending, 1: installed, -1: rejected
    volatile LONG redirects;
    volatile LONG results;
    volatile LONG stage;
    DWORD error_code;
    wchar_t game_root[32768];
    wchar_t overlay_root[32768];
    wchar_t error[256];
};
inline std::wstring mapping_name(DWORD pid) {
    return L"Local\\cstmSKN-injector-fixture-" + std::to_wstring(pid);
}
inline std::wstring full_path(const std::wstring& input) {
    const DWORD count = GetFullPathNameW(input.c_str(), 0, nullptr, nullptr);
    if (count == 0 || count > 32768) return {};
    std::wstring path(count, L'\0');
    const DWORD written = GetFullPathNameW(input.c_str(), count, path.data(), nullptr);
    if (written == 0 || written >= count) return {};
    path.resize(written);
    if (path.starts_with(L"\\\\?\\") && path.size() > 5 && path[5] == L':') path.erase(0, 4);
    for (auto& ch : path) if (ch == L'/') ch = L'\\';
    return path;
}
inline bool same_text(const std::wstring& a, const std::wstring& b) {
    return CompareStringOrdinal(a.c_str(), -1, b.c_str(), -1, TRUE) == CSTR_EQUAL;
}
inline std::wstring executable_path() {
    std::wstring result(32768, L'\0');
    DWORD len = GetModuleFileNameW(nullptr, result.data(), static_cast<DWORD>(result.size()));
    if (len == 0 || len >= result.size()) return {};
    result.resize(len);
    return full_path(result);
}
inline std::wstring directory(const std::wstring& path) {
    const auto pos = path.find_last_of(L"\\/");
    return pos == std::wstring::npos ? std::wstring{} : path.substr(0, pos);
}
inline std::wstring file_name(const std::wstring& path) {
    const auto pos = path.find_last_of(L"\\/");
    return pos == std::wstring::npos ? path : path.substr(pos + 1);
}
} // namespace cstm
