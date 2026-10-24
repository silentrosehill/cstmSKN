// Source-built cstmSKN runtime. Standard Windows hooks only; no protection bypass.
std::mutex protocol_output;
void emit(const char* state, const std::string& detail) {
    std::lock_guard lock(protocol_output);
    std::cout << "status 0 " << state << ' ' << detail << std::endl;
}
std::wstring from_utf8(const std::string& text) {
    require(text.find('\0') == std::string::npos, "Configuration contains a null character");
    const int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.c_str(), -1, nullptr, 0);
    require_windows(count > 0, "Configuration is not valid UTF-8");
    std::wstring result(static_cast<size_t>(count), L'\0');
    require_windows(MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text.c_str(), -1,
        result.data(), count) != 0, "Could not decode configuration");
    result.resize(static_cast<size_t>(count - 1));
    require(!result.empty() && result.find_first_of(L"\r\n\t") == std::wstring::npos,
        "Configuration contains an empty path or control character");
    return cstm::full_path(result);
}
std::filesystem::path engine_dll(const std::filesystem::path& binaries) {
    const auto native = binaries / L"cstm-native-overlay.dll";
    return std::filesystem::is_regular_file(native) ? native : binaries / L"cstm-overlay-prototype.dll";
}
struct TargetSearch {
    std::wstring executable;
    DWORD required_pid = 0;
    DWORD pid = 0;
    HWND window = nullptr;
};
BOOL CALLBACK find_target(HWND window, LPARAM context) {
    auto& target = *reinterpret_cast<TargetSearch*>(context);
    DWORD pid = 0;
    GetWindowThreadProcessId(window, &pid);
    if (!pid || (target.required_pid && target.required_pid != pid)) return TRUE;
    Handle process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid));
    if (!process.value) return TRUE;
    wchar_t path[32768]{};
    DWORD count = 32768;
    if (!QueryFullProcessImageNameW(process.value, 0, path, &count) ||
        !cstm::same_text(cstm::full_path(path), target.executable)) return TRUE;
    target.pid = pid;
    target.window = window;
    return FALSE;
}
void fixture_assets(const std::filesystem::path& game, const std::filesystem::path& overlay) {
    const auto parent = game.parent_path();
    wchar_t temp[32768]{};
    require_windows(GetTempPathW(32768, temp) != 0, "Could not locate the test temporary folder");
    const auto parent_text = cstm::full_path(parent.wstring());
    const auto temp_text = cstm::full_path(temp);
    require(parent.filename().wstring().starts_with(L"cstmSKN-ipc-") &&
        parent_text.size() > temp_text.size() &&
        cstm::same_text(parent_text.substr(0, temp_text.size()), temp_text) &&
        game.filename() == L"Game data" && overlay == parent / L"Overlay",
        "Protocol fixtures must use their dedicated temporary folder");
    write(game / L"DATA/FINAL/fixture.wad.client", "original");
    write(overlay / L"DATA/FINAL/fixture.wad.client", "custom");
    write(game / L"DATA/FINAL/missing.wad.client", "fallback");
    write(parent / L"Game data-other/outside.wad.client", "outside");
    write(game / L"settings.json", "original-settings");
    write(overlay / L"settings.json", "must-not-be-read");
    write(game / L"DATA/FINAL/locked.wad.client", "original-locked");
    write(overlay / L"DATA/FINAL/locked.wad.client", "custom-locked");
    write(game / L"DATA/FINAL/maximum.wad.client", "original-maximum");
    write(overlay / L"DATA/FINAL/maximum.wad.client", "overlay-must-not-change");
    write(game / L"DATA/FINAL/skin-é-雪.wad.client", "original-unicode");
    write(overlay / L"DATA/FINAL/skin-é-雪.wad.client", "custom-unicode");
    write(overlay / L"DATA/FINAL/overlay-only.wad.client", "custom-only");
}
void runtime_worker(std::wstring game, std::wstring overlay, bool fixture_test, std::atomic_bool& stop) {
    try {
        const auto binaries = std::filesystem::path(cstm::directory(cstm::executable_path()));
        std::unique_ptr<Child> fixture;
        Handle fixture_job;
        Handle locked_overlay;
        std::wstring target_exe;
        if (fixture_test) {
            fixture_assets(game, overlay);
            locked_overlay.value = CreateFileW((std::filesystem::path(overlay) / L"DATA/FINAL/locked.wad.client").c_str(),
                GENERIC_READ, 0, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
            require_windows(locked_overlay.value != INVALID_HANDLE_VALUE, "Could not lock test overlay");
            fixture_job.value = CreateJobObjectW(nullptr, nullptr);
            require_windows(fixture_job.value != nullptr, "Could not create protocol fixture job");
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            require_windows(SetInformationJobObject(fixture_job.value, JobObjectExtendedLimitInformation,
                &limits, sizeof(limits)) != FALSE, "Could not configure protocol fixture job");
            StartupAttributes attributes(fixture_job.value);
            STARTUPINFOEXW startup{};
            startup.StartupInfo.cb = sizeof(startup);
            startup.lpAttributeList = attributes.value;
            PROCESS_INFORMATION pi{};
            target_exe = (binaries / cstm::fixture_name).wstring();
            require_windows(CreateProcessW(target_exe.c_str(), nullptr, nullptr, nullptr, FALSE,
                CREATE_SUSPENDED | EXTENDED_STARTUPINFO_PRESENT, nullptr, binaries.c_str(),
                &startup.StartupInfo, &pi) != FALSE, "Could not start protocol fixture");
            fixture = std::make_unique<Child>(pi);
            require_windows(ResumeThread(fixture->thread.value) != static_cast<DWORD>(-1), "Could not resume protocol fixture");
        } else {
            target_exe = (std::filesystem::path(game) / L"League of Legends.exe").wstring();
            require(std::filesystem::is_regular_file(target_exe) &&
                std::filesystem::is_directory(std::filesystem::path(game) / L"DATA/FINAL"),
                "Selected folder is not a League game installation");
        }
        require(std::filesystem::is_directory(overlay), "Overlay directory is missing");
        Module dll;
        dll.value = LoadLibraryW(engine_dll(binaries).c_str());
        require_windows(dll.value != nullptr, "Could not load native engine DLL");
        const auto proc = std::bit_cast<HOOKPROC>(GetProcAddress(dll.value, "CstmFixtureHook"));
        require_windows(proc != nullptr, "Native engine DLL has no hook entry point");
        emit("injecting", "native engine ready; waiting for selected League installation");
        while (!stop.load()) {
            TargetSearch target{cstm::full_path(target_exe), fixture ? fixture->pid : 0};
            EnumWindows(find_target, reinterpret_cast<LPARAM>(&target));
            if (!target.window) { Sleep(100); continue; }
            if (fixture) fixture->window = target.window;
            Handle process(OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, target.pid));
            require_windows(process.value != nullptr, "Could not inspect selected game process");
            Handle mapping(CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0,
                sizeof(cstm::Shared), cstm::mapping_name(target.pid).c_str()));
            const DWORD mapping_error = GetLastError();
            require_windows(mapping.value != nullptr, "Could not configure native overlay session");
            require(mapping_error != ERROR_ALREADY_EXISTS,
                "This match already has a native overlay session. Start a fresh match after changing engines or selections.");
            View view;
            view.value = static_cast<cstm::Shared*>(MapViewOfFile(mapping.value, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(cstm::Shared)));
            require_windows(view.value != nullptr, "Could not map native overlay session");
            auto& config = *view.value;
            ZeroMemory(&config, sizeof(config));
            config.version = cstm::protocol_version;
            config.size = sizeof(config);
            config.pid = target.pid;
            config.owner_pid = GetCurrentProcessId();
            config.mode = fixture_test ? cstm::fixture_mode : cstm::league_mode;
            require(wcscpy_s(config.game_root, game.c_str()) == 0 &&
                wcscpy_s(config.overlay_root, overlay.c_str()) == 0 &&
                wcscpy_s(config.target_exe, target.executable.c_str()) == 0, "Native session paths are too long");
            struct Disable { cstm::Shared& c; ~Disable() { InterlockedExchange(&c.enabled, 0); } } disable{config};
            Hook hook;
            const DWORD tid = GetWindowThreadProcessId(target.window, nullptr);
            hook.value = SetWindowsHookExW(WH_GETMESSAGE, proc, dll.value, tid);
            if (!hook.value) {
                const DWORD error = GetLastError();
                if (WaitForSingleObject(process.value, 0) == WAIT_OBJECT_0) { emit("exited", "game closed before attachment"); continue; }
                throw WindowsError("SetWindowsHookEx failed", error);
            }
            require_windows(PostMessageW(target.window, WM_NULL, 0, 0) != FALSE, "Could not signal native overlay");
            const ULONGLONG deadline = GetTickCount64() + 15000;
            while (!stop.load() && InterlockedCompareExchange(&config.ready, 0, 0) == 0 &&
                WaitForSingleObject(process.value, 0) == WAIT_TIMEOUT && GetTickCount64() < deadline) Sleep(20);
            if (stop.load()) break;
            if (WaitForSingleObject(process.value, 0) == WAIT_OBJECT_0) { emit("exited", "game closed during attachment"); continue; }
            if (config.ready < 0) throw WindowsError(utf8(config.error).c_str(), config.error_code);
            require(config.ready == 1, "Native DLL did not acknowledge attachment. Check Windows CodeIntegrity diagnostics.");
            InterlockedExchange(&config.enabled, 1);
            emit("injected", "native overlay attached; checking actual overlay reads");
            if (fixture_test) require_windows(PostMessageW(target.window, cstm::test_reads, 0, 0) != FALSE, "Could not request protocol fixture reads");
            bool active = false;
            const ULONGLONG reads_deadline = GetTickCount64() + 30000;
            while (!stop.load() && WaitForSingleObject(process.value, 0) == WAIT_TIMEOUT) {
                if (!active && InterlockedCompareExchange(&config.redirects, 0, 0) > 0 &&
                    (!fixture_test || (InterlockedCompareExchange(&config.stage, 0, 0) == 2 && config.results == cstm::expected_results && config.redirects == 5))) {
                    active = true;
                    emit("waiting", "native overlay reads observed");
                }
                require(active || GetTickCount64() < reads_deadline,
                    "Attached, but no overlay reads were observed. The game file-loading path or selection may be unsupported.");
                if (fixture_test && config.stage == 2) {
                    require(config.results == cstm::expected_results && config.redirects == 5,
                        "Protocol fixture file isolation failed");
                }
                Sleep(50);
            }
            InterlockedExchange(&config.enabled, 0);
            if (!stop.load()) { emit("exited", "game exited; waiting for next match"); }
            if (fixture_test) break;
        }
    } catch (const WindowsError& error) {
        std::ostringstream detail;
        detail << error.what() << ": 0x" << std::hex << std::setw(8) << std::setfill('0') << error.code;
        emit("failed", detail.str());
    } catch (const std::exception& error) { emit("failed", error.what()); }
}
int run_protocol(bool fixture_test) {
    std::wstring game, overlay;
    std::atomic_bool stop = false;
    std::thread worker;
    try {
        std::string line;
        while (std::getline(std::cin, line)) {
            if (!line.empty() && line.back() == '\r') line.pop_back();
            if (line == "stop") break;
            require(!worker.joinable(), "Stop the current session before changing its configuration");
            if (line.starts_with("config game ")) game = from_utf8(line.substr(12));
            else if (line.starts_with("config prefix ")) overlay = from_utf8(line.substr(14));
            else if (line == "start scan") {
                require(!game.empty() && !overlay.empty(), "Configure the game and overlay folders before starting");
                worker = std::thread(runtime_worker, game, overlay, fixture_test, std::ref(stop));
            } else throw std::runtime_error("Unsupported native engine command");
        }
    } catch (const std::exception& error) { emit("failed", error.what()); }
    stop.store(true);
    if (worker.joinable()) worker.join();
    return 0;
}
