#include "shared.h"
#include <cstring>
#include <mutex>
#include <vector>
#include <bit>
#include <psapi.h>

extern "C" __declspec(dllexport) LRESULT CALLBACK CstmFixtureHook(int, WPARAM, LPARAM);
namespace {
using OpenWide = decltype(&CreateFileW);
using OpenAnsi = decltype(&CreateFileA);
OpenWide real_wide = nullptr;
OpenAnsi real_ansi = nullptr;
cstm::Shared* config = nullptr;
HANDLE mapping = nullptr;
HANDLE owner = nullptr;
std::once_flag installed;
struct LastError {
    DWORD code = GetLastError();
    ~LastError() { SetLastError(code); }
};

bool read_only(DWORD access, DWORD disposition, DWORD flags) {
    constexpr DWORD writing = GENERIC_WRITE | GENERIC_ALL | FILE_WRITE_DATA |
        FILE_APPEND_DATA | FILE_WRITE_ATTRIBUTES | FILE_WRITE_EA | DELETE | WRITE_DAC | WRITE_OWNER |
        MAXIMUM_ALLOWED;
    // Special opens retain their original semantics, even if desired access
    // looks read-only. MAXIMUM_ALLOWED can grant write/delete access implicitly.
    constexpr DWORD special = FILE_FLAG_DELETE_ON_CLOSE | FILE_FLAG_OPEN_REPARSE_POINT |
        FILE_FLAG_BACKUP_SEMANTICS;
    return disposition == OPEN_EXISTING && (access & writing) == 0 && (flags & special) == 0;
}
std::wstring redirect(LPCWSTR input, DWORD access, DWORD disposition, DWORD flags) {
    if (!input || !config || InterlockedCompareExchange(&config->enabled, 0, 0) != 1 ||
        !read_only(access, disposition, flags)) return {};
    if (!owner || WaitForSingleObject(owner, 0) != WAIT_TIMEOUT) {
        InterlockedExchange(&config->enabled, 0);
        return {};
    }
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
    LastError error; // Destroyed after temporary strings and their allocations.
    std::wstring replacement;
    try { replacement = redirect(path, access, disposition, flags); } catch (...) { /* fail open */ }
    SetLastError(error.code);
    if (!replacement.empty()) {
        HANDLE file = real_wide(replacement.c_str(), access, share, sa, disposition, flags, template_file);
        if (file != INVALID_HANDLE_VALUE) {
            error.code = GetLastError();
            InterlockedIncrement(&config->redirects);
            return file;
        }
        // A replacement can disappear, be locked or become inaccessible after
        // the metadata check. Preserve the original operation as the fallback.
        SetLastError(error.code);
    }
    HANDLE file = real_wide(path, access, share, sa, disposition, flags, template_file);
    error.code = GetLastError();
    return file;
}
HANDLE WINAPI open_ansi(LPCSTR path, DWORD access, DWORD share, LPSECURITY_ATTRIBUTES sa,
                       DWORD disposition, DWORD flags, HANDLE template_file) {
    LastError error;
    std::wstring replacement;
    try {
        if (path) {
            const UINT cp = AreFileApisANSI() ? CP_ACP : CP_OEMCP;
            const int size = MultiByteToWideChar(cp, 0, path, -1, nullptr, 0);
            if (size > 0 && size <= 32768) {
                std::wstring wide(static_cast<size_t>(size), L'\0');
                if (MultiByteToWideChar(cp, 0, path, -1, wide.data(), size))
                    replacement = redirect(wide.c_str(), access, disposition, flags);
            }
        }
    } catch (...) { /* fail open */ }
    SetLastError(error.code);
    if (!replacement.empty()) {
        HANDLE file = real_wide(replacement.c_str(), access, share, sa, disposition, flags, template_file);
        if (file != INVALID_HANDLE_VALUE) {
            error.code = GetLastError();
            InterlockedIncrement(&config->redirects);
            return file;
        }
        SetLastError(error.code);
    }
    HANDLE file = real_ansi(path, access, share, sa, disposition, flags, template_file);
    error.code = GetLastError();
    return file;
}
struct Patch { void** slot; void* original; void* replacement; };
void reject(const wchar_t* message, DWORD code = ERROR_INVALID_DATA) noexcept {
    if (!config) return;
    wcsncpy_s(config->error, message, _TRUNCATE);
    config->error_code = code;
    InterlockedExchange(&config->enabled, 0);
    InterlockedExchange(&config->ready, -1);
}
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
    const auto exe = cstm::executable_path();
    HMODULE self = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
        reinterpret_cast<LPCWSTR>(&CstmFixtureHook), &self)) return;
    wchar_t dll_path[32768]{};
    DWORD len = GetModuleFileNameW(self, dll_path, 32768);
    FreeLibrary(self);
    if (!len || len >= 32768) return;
    const auto dll_dir = cstm::directory(cstm::full_path(dll_path));
    mapping = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE,
        cstm::mapping_name(GetCurrentProcessId()).c_str());
    if (!mapping) return;
    config = static_cast<cstm::Shared*>(MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(cstm::Shared)));
    if (!config) { CloseHandle(mapping); mapping = nullptr; return; }
    if (config->version != cstm::protocol_version || config->size != sizeof(cstm::Shared) ||
        config->pid != GetCurrentProcessId() ||
        !wmemchr(config->game_root, L'\0', 32768) || !wmemchr(config->overlay_root, L'\0', 32768) ||
        !wmemchr(config->target_exe, L'\0', 32768) || !config->owner_pid) {
        reject(L"Fixture configuration has an incompatible version, size, target or path");
        return;
    }
    const bool fixture = config->mode == cstm::fixture_mode &&
        cstm::same_text(cstm::file_name(exe), cstm::fixture_name) &&
        cstm::same_text(cstm::directory(exe), dll_dir);
    const bool league = config->mode == cstm::league_mode &&
        cstm::same_text(cstm::file_name(exe), L"League of Legends.exe") &&
        cstm::same_text(cstm::directory(exe), cstm::full_path(config->game_root));
    if ((!fixture && !league) || !cstm::same_text(exe, cstm::full_path(config->target_exe))) {
        reject(L"The running executable does not match the configured target"); return;
    }
    owner = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, config->owner_pid);
    if (!owner) { reject(L"Could not inspect the controlling host", GetLastError()); return; }
    wchar_t owner_exe[32768]{};
    DWORD owner_len = 32768;
    if (!QueryFullProcessImageNameW(owner, 0, owner_exe, &owner_len)) {
        reject(L"Could not identify the controlling host", GetLastError()); return;
    }
    const auto owner_path = cstm::full_path(owner_exe);
    if (!cstm::same_text(cstm::directory(owner_path), dll_dir) ||
        (!cstm::same_text(cstm::file_name(owner_path), L"cstm-injector-prototype.exe") &&
         !cstm::same_text(cstm::file_name(owner_path), L"cstm-native-host.exe"))) {
        reject(L"The controlling host is not from this engine installation"); return;
    }
    // Pin before changing an import address: unhooking the window must never
    // unload a DLL still referenced by an import thunk.
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
        reinterpret_cast<LPCWSTR>(&CstmFixtureHook), &self)) {
        reject(L"Could not retain the fixture DLL", GetLastError());
        return;
    }
    HMODULE kernel = GetModuleHandleW(L"kernel32.dll");
    real_wide = std::bit_cast<OpenWide>(GetProcAddress(kernel, "CreateFileW"));
    real_ansi = std::bit_cast<OpenAnsi>(GetProcAddress(kernel, "CreateFileA"));
    if (!real_wide || !real_ansi) { reject(L"Windows file APIs are unavailable", GetLastError()); return; }
    std::vector<HMODULE> modules(1024);
    DWORD bytes = 0;
    if (!EnumProcessModules(GetCurrentProcess(), modules.data(),
        static_cast<DWORD>(modules.size() * sizeof(HMODULE)), &bytes) || bytes > modules.size() * sizeof(HMODULE)) {
        reject(L"Could not enumerate the target's loaded modules", GetLastError()); return;
    }
    modules.resize(bytes / sizeof(HMODULE));
    std::vector<Patch> patches;
    for (HMODULE module : modules) {
    if (fixture && module != GetModuleHandleW(nullptr)) continue;
    wchar_t module_name[32768]{};
    if (!GetModuleFileNameW(module, module_name, 32768)) continue;
    const auto module_path = cstm::full_path(module_name);
    const auto root = cstm::full_path(config->game_root) + L"\\";
    if (league && (module == self || module_path.size() <= root.size() ||
        !cstm::same_text(module_path.substr(0, root.size()), root))) continue;
    HMODULE retained = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
        reinterpret_cast<LPCWSTR>(module), &retained)) continue;
    struct ReleaseModule { HMODULE value; ~ReleaseModule() { FreeLibrary(value); } } retained_module{retained};
    auto* base = reinterpret_cast<BYTE*>(module);
    const auto* dos = reinterpret_cast<IMAGE_DOS_HEADER*>(base);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) { reject(L"Fixture DOS header is invalid"); return; }
    const auto* nt = reinterpret_cast<IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) { reject(L"Fixture PE header is invalid"); return; }
    const auto imports = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    if (!imports.VirtualAddress) continue;
    auto* descriptor = reinterpret_cast<IMAGE_IMPORT_DESCRIPTOR*>(base + imports.VirtualAddress);
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
                if (*slot != expected) { reject(L"Fixture file API import was already changed"); return; }
                patches.push_back({slot, expected, replacement});
            }
        }
    }
    }
    bool wide = false, ansi = false;
    for (const auto& patch : patches) {
        wide |= patch.replacement == reinterpret_cast<void*>(&open_wide);
        ansi |= patch.replacement == reinterpret_cast<void*>(&open_ansi);
    }
    if ((!wide && !ansi) || (fixture && (!wide || !ansi))) {
        reject(L"Unsupported file-loading path: no compatible Windows file API imports were found"); return;
    }
    for (const auto& patch : patches) {
        if (!exchange(patch.slot, patch.replacement)) {
            reject(L"Could not update or protect the fixture import table", GetLastError());
            return;
        }
    }
    InterlockedExchange(&config->ready, 1);
}
} // namespace
extern "C" __declspec(dllexport) LRESULT CALLBACK CstmFixtureHook(int code, WPARAM wp, LPARAM lp) {
    if (code >= 0) {
        try { std::call_once(installed, initialize); }
        catch (...) { reject(L"Fixture DLL initialization raised an exception", ERROR_UNHANDLED_EXCEPTION); }
    }
    return CallNextHookEx(nullptr, code, wp, lp);
}
BOOL WINAPI DllMain(HINSTANCE, DWORD, LPVOID) { return TRUE; }
