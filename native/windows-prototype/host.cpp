#include "shared.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <vector>
#include <bit>

namespace {
struct Handle {
    HANDLE value = nullptr;
    explicit Handle(HANDLE h = nullptr) : value(h) {}
    ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
};
struct View {
    cstm::Shared* value = nullptr;
    ~View() { if (value) UnmapViewOfFile(value); }
};
struct Hook {
    HHOOK value = nullptr;
    ~Hook() { if (value) UnhookWindowsHookEx(value); }
};
struct Module {
    HMODULE value = nullptr;
    ~Module() { if (value) FreeLibrary(value); }
};
void require(bool ok, const char* message) {
    if (!ok) throw std::runtime_error(message);
}
void write(const std::filesystem::path& path, const std::string& text) {
    std::filesystem::create_directories(path.parent_path());
    std::ofstream stream(path, std::ios::binary | std::ios::trunc);
    stream << text;
    require(stream.good(), "Could not write fixture asset");
}
std::string read(const std::filesystem::path& path) {
    std::ifstream stream(path, std::ios::binary);
    return {std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>()};
}
struct Child {
    Handle process;
    Handle thread;
    DWORD pid;
    HWND window = nullptr;
    explicit Child(PROCESS_INFORMATION pi) : process(pi.hProcess), thread(pi.hThread), pid(pi.dwProcessId) {}
    ~Child() {
        if (window) PostMessageW(window, WM_CLOSE, 0, 0);
        if (WaitForSingleObject(process.value, 3000) != WAIT_OBJECT_0) {
            // The only target the host can create or stop is its own fixture.
            TerminateProcess(process.value, 1);
            WaitForSingleObject(process.value, 3000);
        }
    }
};
template<class Predicate> void wait_for(Predicate predicate, const char* message) {
    const ULONGLONG end = GetTickCount64() + 10000;
    while (!predicate()) {
        require(GetTickCount64() < end, message);
        Sleep(10);
    }
}
struct Find { DWORD pid; HWND window = nullptr; };
BOOL CALLBACK find_window(HWND hwnd, LPARAM data) {
    auto& found = *reinterpret_cast<Find*>(data);
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (pid != found.pid) return TRUE;
    wchar_t cls[128]{};
    GetClassNameW(hwnd, cls, 128);
    if (std::wstring(cls) != cstm::fixture_class) return TRUE;
    found.window = hwnd;
    return FALSE;
}
void run_once(const std::filesystem::path& folder, const std::filesystem::path& binary_dir) {
    const auto game = folder / L"Game";
    const auto overlay = folder / L"Overlay";
    const auto wad = std::filesystem::path(L"DATA/FINAL/fixture.wad.client");
    write(game / wad, "original");
    write(overlay / wad, "custom");
    write(game / L"DATA/FINAL/missing.wad.client", "fallback");
    write(folder / L"Game-other/outside.wad.client", "outside");
    write(game / L"settings.json", "original-settings");
    write(overlay / L"settings.json", "must-not-be-read");

    const auto fixture = binary_dir / cstm::fixture_name;
    require(std::filesystem::is_regular_file(fixture), "The test fixture is missing");
    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION pi{};
    // No arbitrary PID, executable path, or target option is accepted.
    require(CreateProcessW(fixture.c_str(), nullptr, nullptr, nullptr, FALSE,
        0, nullptr, binary_dir.c_str(), &startup, &pi) != FALSE, "Could not start the fixture");
    Child child(pi);
    Find found{child.pid};
    wait_for([&] { EnumWindows(find_window, reinterpret_cast<LPARAM>(&found)); return found.window != nullptr; },
        "The fixture did not create its test window");
    child.window = found.window;

    Handle mapping(CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0,
        sizeof(cstm::Shared), cstm::mapping_name(child.pid).c_str()));
    require(mapping.value != nullptr, "Could not create the test mapping");
    require(GetLastError() != ERROR_ALREADY_EXISTS, "A mapping for this test process already exists");
    View view;
    view.value = static_cast<cstm::Shared*>(MapViewOfFile(mapping.value, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(cstm::Shared)));
    require(view.value != nullptr, "Could not map test configuration");
    auto& config = *view.value;
    ZeroMemory(&config, sizeof(config));
    config.version = cstm::protocol_version;
    config.size = sizeof(config);
    config.pid = child.pid;
    require(wcscpy_s(config.game_root, cstm::full_path(game.wstring()).c_str()) == 0,
        "Game test path is too long");
    require(wcscpy_s(config.overlay_root, cstm::full_path(overlay.wstring()).c_str()) == 0,
        "Overlay test path is too long");
    require(PostMessageW(child.window, cstm::test_before, 0, 0) != FALSE, "Could not request baseline read");
    wait_for([&] { return InterlockedCompareExchange(&config.stage, 0, 0) == 1; }, "Baseline test timed out");
    require(config.results == 1, "Unmodified fixture read the wrong file");

    Module dll;
    dll.value = LoadLibraryW((binary_dir / L"cstm-overlay-prototype.dll").c_str());
    require(dll.value != nullptr, "Could not load the prototype DLL");
    const auto proc = std::bit_cast<HOOKPROC>(GetProcAddress(dll.value, "CstmFixtureHook"));
    require(proc != nullptr, "The prototype DLL is missing its hook entry point");
    const DWORD tid = GetWindowThreadProcessId(child.window, nullptr);
    Hook hook;
    hook.value = SetWindowsHookExW(WH_GETMESSAGE, proc, dll.value, tid);
    require(hook.value != nullptr, "Windows refused the fixture hook");
    PostMessageW(child.window, WM_NULL, 0, 0);
    wait_for([&] { return InterlockedCompareExchange(&config.ready, 0, 0) != 0; }, "DLL initialization timed out");
    require(config.ready == 1, "The prototype rejected its fixture or import table");
    InterlockedExchange(&config.enabled, 1);
    PostMessageW(child.window, cstm::test_reads, 0, 0);
    wait_for([&] { return InterlockedCompareExchange(&config.stage, 0, 0) >= 2; }, "Overlay read tests timed out");
    require(config.results == cstm::expected_results, "One or more path/read isolation checks failed");
    require(config.redirects >= 3, "Expected Unicode, ANSI, and mixed-case redirections");
    require(read(game / wad) == "original", "The prototype changed the original asset");
    require(read(overlay / L"settings.json") == "must-not-be-read", "A non-WAD asset was changed");

    InterlockedExchange(&config.enabled, 0);
    require(UnhookWindowsHookEx(hook.value) != FALSE, "Could not remove the window hook");
    hook.value = nullptr;
    PostMessageW(child.window, cstm::test_stopped, 0, 0);
    wait_for([&] { return InterlockedCompareExchange(&config.stage, 0, 0) == 3; }, "Stop test timed out");
    require(config.results == 1, "Stopping did not restore the original read");
    require(PostMessageW(child.window, WM_CLOSE, 0, 0) != FALSE, "Could not close fixture");
    require(WaitForSingleObject(child.process.value, 5000) == WAIT_OBJECT_0, "Fixture did not exit cleanly");
    DWORD exit_code = 1;
    GetExitCodeProcess(child.process.value, &exit_code);
    require(exit_code == 0, "Fixture returned a failure exit code");
    child.window = nullptr;
}
} // namespace
int wmain(int argc, wchar_t** argv) {
    if (argc != 2 || std::wstring(argv[1]) != L"--self-test") {
        std::cerr << "Only --self-test is supported. This prototype cannot target League or another app.\n";
        return 2;
    }
    std::filesystem::path scratch;
    try {
        wchar_t temp[32768]{};
        require(GetTempPathW(32768, temp) != 0, "Could not resolve the temporary directory");
        scratch = std::filesystem::path(temp) /
            (L"cstmSKN-native-test-" + std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64()));
        require(std::filesystem::create_directory(scratch), "Could not create an isolated test directory");
        const auto binaries = std::filesystem::path(cstm::directory(cstm::executable_path()));
        for (int iteration = 0; iteration < 2; ++iteration) {
            run_once(scratch / std::to_wstring(iteration), binaries);
            std::cout << "PASS session " << iteration + 1 << ": DLL load, Unicode/ANSI reads, fallback, boundary/traversal, non-WAD/write isolation, stop, clean exit\n";
        }
        std::filesystem::remove_all(scratch);
        std::cout << "PASS: native injector self-test. Fixture only; League compatibility is untested.\n";
        return 0;
    } catch (const std::exception& error) {
        std::error_code ignored;
        if (!scratch.empty()) std::filesystem::remove_all(scratch, ignored);
        std::cerr << "FAIL: " << error.what() << " (Windows error " << GetLastError() << ")\n";
        return 1;
    }
}
