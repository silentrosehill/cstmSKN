#include "shared.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <vector>
#include <bit>
#include <iomanip>

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
struct WindowsError : std::runtime_error {
    DWORD code;
    WindowsError(const char* message, DWORD captured) : std::runtime_error(message), code(captured) {}
};
void require(bool ok, const char* message) {
    if (!ok) throw std::runtime_error(message);
}
void require_windows(bool ok, const char* message) {
    if (!ok) throw WindowsError(message, GetLastError());
}
struct StartupAttributes {
    HANDLE job;
    std::vector<BYTE> storage;
    LPPROC_THREAD_ATTRIBUTE_LIST value = nullptr;
    explicit StartupAttributes(HANDLE owner_job) : job(owner_job) {
        SIZE_T bytes = 0;
        InitializeProcThreadAttributeList(nullptr, 1, 0, &bytes);
        require_windows(bytes != 0, "Could not size the fixture startup attributes");
        storage.resize(bytes);
        auto* list = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
        require_windows(InitializeProcThreadAttributeList(list, 1, 0, &bytes) != FALSE,
            "Could not initialize fixture startup attributes");
        if (!UpdateProcThreadAttribute(list, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST,
            &job, sizeof(job), nullptr, nullptr)) {
            const DWORD error = GetLastError();
            DeleteProcThreadAttributeList(list);
            throw WindowsError("Could not set the fixture ownership job", error);
        }
        value = list;
    }
    ~StartupAttributes() { if (value) DeleteProcThreadAttributeList(value); }
    StartupAttributes(const StartupAttributes&) = delete;
    StartupAttributes& operator=(const StartupAttributes&) = delete;
};
std::string utf8(const wchar_t* text) {
    const int count = WideCharToMultiByte(CP_UTF8, 0, text, -1, nullptr, 0, nullptr, nullptr);
    if (count <= 1) return "No DLL diagnostic was supplied";
    std::string result(static_cast<size_t>(count), '\0');
    WideCharToMultiByte(CP_UTF8, 0, text, -1, result.data(), count, nullptr, nullptr);
    result.resize(static_cast<size_t>(count - 1));
    return result;
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
template<class Predicate> void wait_for_child(const Child& child, Predicate predicate, const char* message) {
    wait_for([&] {
        const DWORD state = WaitForSingleObject(child.process.value, 0);
        require_windows(state != WAIT_FAILED, "Could not query the fixture process");
        require(state == WAIT_TIMEOUT, "The fixture exited before completing its request");
        return predicate();
    }, message);
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
void run_once(const std::filesystem::path& folder, const std::filesystem::path& binary_dir,
              bool close_job = false) {
    const auto game = folder / L"Game data";
    const auto overlay = folder / L"Overlay";
    const auto wad = std::filesystem::path(L"DATA/FINAL/fixture.wad.client");
    write(game / wad, "original");
    write(overlay / wad, "custom");
    write(game / L"DATA/FINAL/missing.wad.client", "fallback");
    write(folder / L"Game data-other/outside.wad.client", "outside");
    write(game / L"settings.json", "original-settings");
    write(overlay / L"settings.json", "must-not-be-read");
    const auto locked = std::filesystem::path(L"DATA/FINAL/locked.wad.client");
    write(game / locked, "original-locked");
    write(overlay / locked, "custom-locked");
    write(game / L"DATA/FINAL/maximum.wad.client", "original-maximum");
    write(overlay / L"DATA/FINAL/maximum.wad.client", "overlay-must-not-change");
    write(game / L"DATA/FINAL/skin-é-雪.wad.client", "original-unicode");
    write(overlay / L"DATA/FINAL/skin-é-雪.wad.client", "custom-unicode");
    write(overlay / L"DATA/FINAL/overlay-only.wad.client", "custom-only");
    Handle locked_overlay(CreateFileW((overlay / locked).c_str(), GENERIC_READ, 0,
        nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
    require_windows(locked_overlay.value != INVALID_HANDLE_VALUE, "Could not lock the test overlay");

    // No inheritable job handle: closing the owner's last handle terminates
    // its fixture even if normal C++ cleanup cannot run.
    Handle job(CreateJobObjectW(nullptr, nullptr));
    require_windows(job.value != nullptr, "Could not create the fixture job");
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    require_windows(SetInformationJobObject(job.value, JobObjectExtendedLimitInformation,
        &limits, sizeof(limits)) != FALSE, "Could not configure fixture job cleanup");

    const auto fixture = binary_dir / cstm::fixture_name;
    require(std::filesystem::is_regular_file(fixture), "The test fixture is missing");
    StartupAttributes attributes(job.value);
    STARTUPINFOEXW startup{};
    startup.StartupInfo.cb = sizeof(startup);
    startup.lpAttributeList = attributes.value;
    PROCESS_INFORMATION pi{};
    // No arbitrary PID, executable path, or target option is accepted.
    require_windows(CreateProcessW(fixture.c_str(), nullptr, nullptr, nullptr, FALSE,
        CREATE_SUSPENDED | EXTENDED_STARTUPINFO_PRESENT, nullptr, binary_dir.c_str(),
        &startup.StartupInfo, &pi) != FALSE, "Could not start the fixture");
    Child child(pi);
    BOOL owned = FALSE;
    require_windows(IsProcessInJob(child.process.value, job.value, &owned) != FALSE,
        "Could not verify fixture job ownership");
    require(owned != FALSE, "The fixture was created outside its owner's job");
    require_windows(ResumeThread(child.thread.value) != static_cast<DWORD>(-1), "Could not resume the fixture");
    Find found{child.pid};
    wait_for_child(child, [&] { EnumWindows(find_window, reinterpret_cast<LPARAM>(&found)); return found.window != nullptr; },
        "The fixture did not create its test window");
    child.window = found.window;

    Handle mapping(CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0,
        sizeof(cstm::Shared), cstm::mapping_name(child.pid).c_str()));
    require_windows(mapping.value != nullptr, "Could not create the test mapping");
    require(GetLastError() != ERROR_ALREADY_EXISTS, "A mapping for this test process already exists");
    View view;
    view.value = static_cast<cstm::Shared*>(MapViewOfFile(mapping.value, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(cstm::Shared)));
    require_windows(view.value != nullptr, "Could not map test configuration");
    auto& config = *view.value;
    ZeroMemory(&config, sizeof(config));
    config.version = cstm::protocol_version;
    config.size = sizeof(config);
    config.pid = child.pid;
    require(wcscpy_s(config.game_root, cstm::full_path(game.wstring()).c_str()) == 0,
        "Game test path is too long");
    require(wcscpy_s(config.overlay_root, cstm::full_path(overlay.wstring()).c_str()) == 0,
        "Overlay test path is too long");
    require_windows(PostMessageW(child.window, cstm::test_before, 0, 0) != FALSE, "Could not request baseline read");
    wait_for_child(child, [&] { return InterlockedCompareExchange(&config.stage, 0, 0) != 0; }, "Baseline test timed out");
    require(config.results == 1, "Unmodified fixture read the wrong file");

    Module dll;
    dll.value = LoadLibraryW((binary_dir / L"cstm-overlay-prototype.dll").c_str());
    require_windows(dll.value != nullptr, "Could not load the prototype DLL");
    const auto proc = std::bit_cast<HOOKPROC>(GetProcAddress(dll.value, "CstmFixtureHook"));
    require_windows(proc != nullptr, "The prototype DLL is missing its hook entry point");
    const DWORD tid = GetWindowThreadProcessId(child.window, nullptr);
    Hook hook;
    hook.value = SetWindowsHookExW(WH_GETMESSAGE, proc, dll.value, tid);
    require_windows(hook.value != nullptr, "Windows refused the fixture hook");
    require_windows(PostMessageW(child.window, WM_NULL, 0, 0) != FALSE, "Could not signal the fixture hook");
    wait_for_child(child, [&] { return InterlockedCompareExchange(&config.ready, 0, 0) != 0; }, "DLL initialization timed out");
    if (config.ready != 1) throw WindowsError(utf8(config.error).c_str(), config.error_code);
    InterlockedExchange(&config.enabled, 1);
    require_windows(PostMessageW(child.window, cstm::test_reads, 0, 0) != FALSE, "Could not request overlay reads");
    wait_for_child(child, [&] {
        const LONG stage = InterlockedCompareExchange(&config.stage, 0, 0);
        require(stage >= 0, "Fixture file operations raised an exception");
        return stage >= 2;
    }, "Overlay read tests timed out");
    if (config.results != cstm::expected_results) {
        std::cerr << "Read result mask: 0x" << std::hex << config.results << std::dec << '\n';
    }
    require(config.results == cstm::expected_results, "One or more path/read isolation checks failed");
    require(config.redirects == 5, "Only successful redirected opens should be counted");
    require(read(game / wad) == "original", "The prototype changed the original asset");
    require(read(overlay / L"settings.json") == "must-not-be-read", "A non-WAD asset was changed");
    require(read(game / L"DATA/FINAL/maximum.wad.client") == "changed", "A writable open did not reach the original test file");
    require(read(overlay / L"DATA/FINAL/maximum.wad.client") == "overlay-must-not-change", "A writable open changed the overlay");
    if (close_job) {
        require_windows(CloseHandle(job.value) != FALSE, "Could not close the fixture job");
        job.value = nullptr;
        require(WaitForSingleObject(child.process.value, 5000) == WAIT_OBJECT_0,
            "The fixture survived closure of its owner's last job handle");
        child.window = nullptr;
        return;
    }

    InterlockedExchange(&config.enabled, 0);
    require_windows(UnhookWindowsHookEx(hook.value) != FALSE, "Could not remove the window hook");
    hook.value = nullptr;
    require_windows(PostMessageW(child.window, cstm::test_stopped, 0, 0) != FALSE, "Could not request the stopped read");
    wait_for_child(child, [&] { return InterlockedCompareExchange(&config.stage, 0, 0) == 3; }, "Stop test timed out");
    require(config.results == 1, "Stopping did not restore the original read");
    require_windows(PostMessageW(child.window, WM_CLOSE, 0, 0) != FALSE, "Could not close fixture");
    require(WaitForSingleObject(child.process.value, 5000) == WAIT_OBJECT_0, "Fixture did not exit cleanly");
    DWORD exit_code = 1;
    require_windows(GetExitCodeProcess(child.process.value, &exit_code) != FALSE, "Could not get fixture exit code");
    require(exit_code == 0, "Fixture returned a failure exit code");
    child.window = nullptr;
}
} // namespace
int wmain(int argc, wchar_t** argv) {
    SetErrorMode(GetErrorMode() | SEM_FAILCRITICALERRORS);
    if (argc != 2 || std::wstring(argv[1]) != L"--self-test") {
        std::cerr << "Only --self-test is supported. This prototype cannot target League or another app.\n";
        return 2;
    }
    std::filesystem::path scratch;
    try {
        try { SetLastError(ERROR_ACCESS_DENIED); require_windows(false, "error capture fixture"); }
        catch (const WindowsError& error) {
            SetLastError(ERROR_SUCCESS); // Cleanup must not replace the failure code.
            require(error.code == ERROR_ACCESS_DENIED, "Windows diagnostics lost the original error code");
        }
        wchar_t temp[32768]{};
        require_windows(GetTempPathW(32768, temp) != 0, "Could not resolve the temporary directory");
        scratch = std::filesystem::path(temp) /
            (L"cstmSKN-native-test-" + std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64()));
        require(std::filesystem::create_directory(scratch), "Could not create an isolated test directory");
        const auto binaries = std::filesystem::path(cstm::directory(cstm::executable_path()));
        for (int iteration = 0; iteration < 2; ++iteration) {
            run_once(scratch / std::to_wstring(iteration), binaries);
            std::cout << "PASS session " << iteration + 1 << ": DLL load, Unicode/ANSI reads, locked/missing fallback, writable/special-open isolation, stop, clean exit\n";
        }
        run_once(scratch / L"job-close", binaries, true);
        std::cout << "PASS: closing the owner's job handle terminates its active fixture\n";
        std::filesystem::remove_all(scratch);
        std::cout << "PASS: native injector self-test. Fixture only; League compatibility is untested.\n";
        return 0;
    } catch (const WindowsError& error) {
        std::error_code ignored;
        if (!scratch.empty()) std::filesystem::remove_all(scratch, ignored);
        std::cerr << "FAIL: " << error.what() << " (Windows error 0x"
            << std::hex << std::setw(8) << std::setfill('0') << error.code << ")\n";
        return 1;
    } catch (const std::exception& error) {
        std::error_code ignored;
        if (!scratch.empty()) std::filesystem::remove_all(scratch, ignored);
        std::cerr << "FAIL: " << error.what() << '\n';
        return 1;
    }
}
