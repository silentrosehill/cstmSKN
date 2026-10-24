#include "shared.h"
#include <array>

namespace {
HANDLE mapping = nullptr;
cstm::Shared* config = nullptr;
std::string read_handle(HANDLE file) {
    if (file == INVALID_HANDLE_VALUE) return {};
    std::array<char, 128> bytes{};
    DWORD count = 0;
    const bool ok = ReadFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &count, nullptr) != FALSE;
    CloseHandle(file);
    return ok ? std::string(bytes.data(), count) : std::string{};
}
std::string read_wide(const std::wstring& path, DWORD access = GENERIC_READ,
                      DWORD flags = FILE_ATTRIBUTE_NORMAL) {
    return read_handle(CreateFileW(path.c_str(), access, FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr, OPEN_EXISTING, flags, nullptr));
}
std::string ansi_path(const std::wstring& path) {
    const int count = WideCharToMultiByte(CP_ACP, 0, path.c_str(), -1, nullptr, 0, nullptr, nullptr);
    if (!count) return {};
    std::string text(static_cast<size_t>(count), '\0');
    WideCharToMultiByte(CP_ACP, 0, path.c_str(), -1, text.data(), count, nullptr, nullptr);
    return text;
}
std::string read_ansi(const std::wstring& path, DWORD flags = FILE_ATTRIBUTE_NORMAL) {
    const auto text = ansi_path(path);
    return read_handle(CreateFileA(text.c_str(), GENERIC_READ, FILE_SHARE_READ,
        nullptr, OPEN_EXISTING, flags, nullptr));
}
bool write_maximum_allowed(const std::wstring& path) {
    HANDLE file = CreateFileW(path.c_str(), MAXIMUM_ALLOWED, FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    constexpr char text[] = "changed";
    constexpr DWORD length = static_cast<DWORD>(sizeof(text) - 1);
    DWORD count = 0;
    const bool ok = WriteFile(file, text, length, &count, nullptr) != FALSE &&
        count == length && SetEndOfFile(file) != FALSE;
    CloseHandle(file);
    return ok;
}
bool missing_error(const std::wstring& path, bool ansi) {
    const auto text = ansi_path(path);
    SetLastError(ERROR_ACCESS_DENIED); // Must not leak this or overlay lookup errors.
    HANDLE file = ansi
        ? CreateFileA(text.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr)
        : CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    const DWORD error = GetLastError();
    if (file != INVALID_HANDLE_VALUE) CloseHandle(file);
    return file == INVALID_HANDLE_VALUE && error == ERROR_FILE_NOT_FOUND;
}
bool connect() {
    if (config) return true;
    mapping = OpenFileMappingW(FILE_MAP_ALL_ACCESS, FALSE, cstm::mapping_name(GetCurrentProcessId()).c_str());
    if (!mapping) return false;
    config = static_cast<cstm::Shared*>(MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(cstm::Shared)));
    return config && config->version == cstm::protocol_version && config->pid == GetCurrentProcessId();
}
LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM wp, LPARAM lp) {
    if (message == cstm::test_before || message == cstm::test_reads || message == cstm::test_stopped) {
        if (!connect()) return 0;
        try {
            const std::wstring root = config->game_root;
            const auto wad = root + L"\\DATA\\FINAL\\fixture.wad.client";
            if (message == cstm::test_before) {
                InterlockedExchange(&config->results, read_wide(wad) == "original" ? 1 : 0);
                InterlockedExchange(&config->stage, 1);
            } else if (message == cstm::test_stopped) {
                InterlockedExchange(&config->results, read_wide(wad) == "original" ? 1 : 0);
                InterlockedExchange(&config->stage, 3);
            } else {
                DWORD results = 0;
                if (read_wide(wad) == "custom") results |= 1;
                if (read_ansi(wad) == "custom") results |= 2;
                if (read_wide(root + L"\\DATA\\FINAL\\missing.wad.client") == "fallback") results |= 4;
                const auto outside = root + L"-other\\outside.wad.client";
                if (read_wide(outside) == "outside") results |= 8;
                if (read_wide(root + L"\\..\\Game data-other\\outside.wad.client") == "outside") results |= 16;
                if (read_wide(root + L"\\settings.json") == "original-settings") results |= 32;
                if (read_wide(wad, GENERIC_READ | GENERIC_WRITE) == "original") results |= 64;
                if (read_wide(root + L"\\data\\final\\FIXTURE.WAD.CLIENT") == "custom") results |= 128;
                const auto locked = root + L"\\DATA\\FINAL\\locked.wad.client";
                if (read_wide(locked) == "original-locked") results |= 256;
                if (read_ansi(locked) == "original-locked") results |= 512;
                if (write_maximum_allowed(root + L"\\DATA\\FINAL\\maximum.wad.client")) results |= 1024;
                if (read_wide(wad, GENERIC_READ, FILE_FLAG_OPEN_REPARSE_POINT) == "original" &&
                    read_ansi(wad, FILE_FLAG_OPEN_REPARSE_POINT) == "original") results |= 2048;
                if (read_wide(root + L"\\DATA\\FINAL\\skin-é-雪.wad.client") == "custom-unicode") results |= 4096;
                const auto absent = root + L"\\DATA\\FINAL\\absent.wad.client";
                if (missing_error(absent, false) && missing_error(absent, true)) results |= 8192;
                if (read_wide(root + L"\\DATA\\FINAL\\overlay-only.wad.client") == "custom-only") results |= 16384;
                InterlockedExchange(&config->results, static_cast<LONG>(results));
                InterlockedExchange(&config->stage, 2);
            }
        } catch (...) { InterlockedExchange(&config->stage, -1); }
        return 0;
    }
    if (message == WM_CLOSE) { DestroyWindow(window); return 0; }
    if (message == WM_DESTROY) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(window, message, wp, lp);
}
} // namespace
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    WNDCLASSW cls{};
    cls.lpfnWndProc = window_proc;
    cls.hInstance = instance;
    cls.lpszClassName = cstm::fixture_class;
    if (!RegisterClassW(&cls)) return 1;
    // An unshown, ordinary top-level window with a real GetMessage loop.
    // No game, desktop window, privilege change, or other app is involved.
    const auto window = CreateWindowExW(0, cls.lpszClassName, L"cstmSKN injector test fixture",
        WS_OVERLAPPEDWINDOW, 0, 0, 200, 100, nullptr, nullptr, instance, nullptr);
    if (!window) return 2;
    MSG message{};
    int result = 0;
    while ((result = static_cast<int>(GetMessageW(&message, nullptr, 0, 0))) > 0) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    if (config) UnmapViewOfFile(config);
    if (mapping) CloseHandle(mapping);
    return result < 0 ? 3 : 0;
}
