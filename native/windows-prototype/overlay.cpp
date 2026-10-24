#include "shared.h"
#include <cstring>
#include <mutex>
#include <vector>
#include <bit>

extern "C" __declspec(dllexport) LRESULT CALLBACK CstmFixtureHook(int, WPARAM, LPARAM);
namespace {
using OpenWide = decltype(&CreateFileW);
using OpenAnsi = decltype(&CreateFileA);
OpenWide real_wide = nullptr;
OpenAnsi real_ansi = nullptr;
cstm::Shared* config = nullptr;
HANDLE mapping = nullptr;
std::once_flag installed;

bool read_only(DWORD access, DWORD disposition) {
    constexpr DWORD writing = GENERIC_WRITE | GENERIC_ALL | FILE_WRITE_DATA |
        FILE_APPEND_DATA | FILE_WRITE_ATTRIBUTES | FILE_WRITE_EA | DELETE | WRITE_DAC | WRITE_OWNER;
    return disposition == OPEN_EXISTING && (access & writing) == 0;
}
std::wstring redirect(LPCWSTR input, DWORD access, DWORD disposition) {
    if (!input || !config || InterlockedCompareExchange(&config->enabled, 0, 0) != 1 ||
        !read_only(access, disposition)) return {};
    const auto path = cstm::full_path(input);
    const std::wstring root = std::wstring(config->game_root) + L"\\";
    if (path.size() <= root.size() ||
        !cstm::same_text(path.substr(0, root.size()), root)) return {};
    const auto relative = path.substr(root.size());
    // The prototype handles read-only WAD assets, never executables/configs.
    const std::wstring suffix = L".wad.client";
    if (relative.size() < suffix.size() ||
        !cstm::same_text(relative.substr(relative.size() - suffix.size()), suffix)) return {};
    const auto candidate = cstm::full_path(std::wstring(config->overlay_root) + L"\\" + relative);
    const DWORD attributes = GetFileAttributesW(candidate.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_DIRECTORY)) return {};
    return candidate;
}
HANDLE WINAPI open_wide(LPCWSTR path, DWORD access, DWORD share, LPSECURITY_ATTRIBUTES sa,
                       DWORD disposition, DWORD flags, HANDLE template_file) {
    const DWORD incoming_error = GetLastError();
    std::wstring replacement;
    try { replacement = redirect(path, access, disposition); } catch (...) { /* fail open */ }
    SetLastError(incoming_error);
    if (!replacement.empty()) {
        InterlockedIncrement(&config->redirects);
        return real_wide(replacement.c_str(), access, share, sa, disposition, flags, template_file);
    }
    return real_wide(path, access, share, sa, disposition, flags, template_file);
}
HANDLE WINAPI open_ansi(LPCSTR path, DWORD access, DWORD share, LPSECURITY_ATTRIBUTES sa,
                       DWORD disposition, DWORD flags, HANDLE template_file) {
    const DWORD incoming_error = GetLastError();
    std::wstring replacement;
    try {
        if (path) {
            const UINT cp = AreFileApisANSI() ? CP_ACP : CP_OEMCP;
            const int size = MultiByteToWideChar(cp, 0, path, -1, nullptr, 0);
            if (size > 0 && size <= 32768) {
                std::wstring wide(static_cast<size_t>(size), L'\0');
                if (MultiByteToWideChar(cp, 0, path, -1, wide.data(), size))
                    replacement = redirect(wide.c_str(), access, disposition);
            }
        }
    } catch (...) { /* fail open */ }
    SetLastError(incoming_error);
    if (!replacement.empty()) {
        InterlockedIncrement(&config->redirects);
        return real_wide(replacement.c_str(), access, share, sa, disposition, flags, template_file);
    }
    return real_ansi(path, access, share, sa, disposition, flags, template_file);
}
struct Patch { void** slot; void* original; void* replacement; };
bool exchange(void** slot, void* value) {
    DWORD protection = 0;
    if (!VirtualProtect(slot, sizeof(void*), PAGE_READWRITE, &protection)) return false;
    InterlockedExchangePointer(slot, value);
    DWORD ignored = 0;
    // If protection cannot be restored, report an error and leave the pinned
    // hook disabled. Its addresses remain valid until this test process exits.
    return VirtualProtect(slot, sizeof(void*), protection, &ignored) != FALSE;
}
void initialize() {
    // Refuse any target except the child test executable beside this DLL.
    const auto exe = cstm::executable_path();
    if (!cstm::same_text(cstm::file_name(exe), cstm::fixture_name)) return;
    HMODULE self = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
        reinterpret_cast<LPCWSTR>(&CstmFixtureHook), &self)) return;
    wchar_t dll_path[32768]{};
    DWORD len = GetModuleFileNameW(self, dll_path, 32768);
    FreeLibrary(self);
    if (!len || len >= 32768 || !cstm::same_text(cstm::directory(exe),
        cstm::directory(cstm::full_path(dll_path)))) return;
    mapping = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE,
        cstm::mapping_name(GetCurrentProcessId()).c_str());
    if (!mapping) return;
    config = static_cast<cstm::Shared*>(MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(cstm::Shared)));
    if (!config) { CloseHandle(mapping); mapping = nullptr; return; }
    if (config->version != cstm::protocol_version || config->size != sizeof(cstm::Shared) ||
        config->pid != GetCurrentProcessId() ||
        !wmemchr(config->game_root, L'\0', 32768) || !wmemchr(config->overlay_root, L'\0', 32768)) {
        InterlockedExchange(&config->ready, -1);
        return;
    }
    // Pin before changing an import address: unhooking the window must never
    // unload a DLL still referenced by an import thunk.
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
        reinterpret_cast<LPCWSTR>(&CstmFixtureHook), &self)) {
        InterlockedExchange(&config->ready, -1);
        return;
    }
    HMODULE kernel = GetModuleHandleW(L"kernel32.dll");
    real_wide = std::bit_cast<OpenWide>(GetProcAddress(kernel, "CreateFileW"));
    real_ansi = std::bit_cast<OpenAnsi>(GetProcAddress(kernel, "CreateFileA"));
    if (!real_wide || !real_ansi) { InterlockedExchange(&config->ready, -1); return; }
    auto* base = reinterpret_cast<BYTE*>(GetModuleHandleW(nullptr));
    const auto* dos = reinterpret_cast<IMAGE_DOS_HEADER*>(base);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) { InterlockedExchange(&config->ready, -1); return; }
    const auto* nt = reinterpret_cast<IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) { InterlockedExchange(&config->ready, -1); return; }
    const auto imports = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    if (!imports.VirtualAddress) { InterlockedExchange(&config->ready, -1); return; }
    auto* descriptor = reinterpret_cast<IMAGE_IMPORT_DESCRIPTOR*>(base + imports.VirtualAddress);
    std::vector<Patch> patches;
    for (; descriptor->Name; ++descriptor) {
        if (!descriptor->OriginalFirstThunk) continue;
        auto* names = reinterpret_cast<IMAGE_THUNK_DATA64*>(base + descriptor->OriginalFirstThunk);
        auto* addresses = reinterpret_cast<IMAGE_THUNK_DATA64*>(base + descriptor->FirstThunk);
        for (; names->u1.AddressOfData; ++names, ++addresses) {
            if (IMAGE_SNAP_BY_ORDINAL64(names->u1.Ordinal)) continue;
            const auto* info = reinterpret_cast<IMAGE_IMPORT_BY_NAME*>(base + names->u1.AddressOfData);
            void* replacement = nullptr;
            void* expected = nullptr;
            if (std::strcmp(info->Name, "CreateFileW") == 0) {
                replacement = reinterpret_cast<void*>(&open_wide);
                expected = reinterpret_cast<void*>(real_wide);
            } else if (std::strcmp(info->Name, "CreateFileA") == 0) {
                replacement = reinterpret_cast<void*>(&open_ansi);
                expected = reinterpret_cast<void*>(real_ansi);
            }
            if (replacement) {
                auto** slot = reinterpret_cast<void**>(&addresses->u1.Function);
                if (*slot != expected) { InterlockedExchange(&config->ready, -1); return; }
                patches.push_back({slot, expected, replacement});
            }
        }
    }
    bool wide = false, ansi = false;
    for (const auto& patch : patches) {
        wide |= patch.replacement == reinterpret_cast<void*>(&open_wide);
        ansi |= patch.replacement == reinterpret_cast<void*>(&open_ansi);
    }
    if (!wide || !ansi) { InterlockedExchange(&config->ready, -1); return; }
    for (const auto& patch : patches) {
        if (!exchange(patch.slot, patch.replacement)) {
            InterlockedExchange(&config->enabled, 0);
            InterlockedExchange(&config->ready, -1);
            return;
        }
    }
    InterlockedExchange(&config->ready, 1);
}
} // namespace
extern "C" __declspec(dllexport) LRESULT CALLBACK CstmFixtureHook(int code, WPARAM wp, LPARAM lp) {
    if (code >= 0) {
        try { std::call_once(installed, initialize); }
        catch (...) { if (config) InterlockedExchange(&config->ready, -1); }
    }
    return CallNextHookEx(nullptr, code, wp, lp);
}
BOOL WINAPI DllMain(HINSTANCE, DWORD, LPVOID) { return TRUE; }
