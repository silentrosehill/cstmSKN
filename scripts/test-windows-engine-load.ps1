# Exercise the real host/DLL loading path, without a game or injection target.
# This proves loading on the test machine only, not Smart App Control trust.
param([string]$EngineDirectory = 'src-tauri/resources/windows')
$ErrorActionPreference = 'Stop'
if (Get-Process -Name 'League of Legends' -ErrorAction SilentlyContinue) {
    throw 'Close League before running the engine loading test.'
}
$engine = (Resolve-Path $EngineDirectory).Path
$overlay = Join-Path ([IO.Path]::GetTempPath()) ("cstmSKN engine test é " + [guid]::NewGuid())
New-Item -ItemType Directory $overlay | Out-Null
Add-Type @'
using System.Runtime.InteropServices;
public static class EngineTestErrorMode {
    [DllImport("kernel32.dll")] public static extern uint GetErrorMode();
    [DllImport("kernel32.dll")] public static extern uint SetErrorMode(uint mode);
}
'@
$oldMode = [EngineTestErrorMode]::GetErrorMode()
# Error reporting only: a blocked DLL must fail rather than open a modal in CI.
[void][EngineTestErrorMode]::SetErrorMode($oldMode -bor 1)
$hostProcess = [Diagnostics.Process]::new()
$stdout = $null
$stderr = $null
$failure = $null
$started = $false
try {
    $hostProcess.StartInfo = [Diagnostics.ProcessStartInfo]::new((Join-Path $engine 'ltk_patcher_host.exe'))
    $hostProcess.StartInfo.WorkingDirectory = $engine
    $hostProcess.StartInfo.UseShellExecute = $false
    $hostProcess.StartInfo.CreateNoWindow = $true
    $hostProcess.StartInfo.RedirectStandardInput = $true
    $hostProcess.StartInfo.RedirectStandardOutput = $true
    $hostProcess.StartInfo.RedirectStandardError = $true
    if (-not $hostProcess.Start()) { throw 'Could not start LTK host' }
    $started = $true
    $stdout = $hostProcess.StandardOutput.ReadToEndAsync()
    $stderr = $hostProcess.StandardError.ReadToEndAsync()
    $hostProcess.StandardInput.Write("config loglevel 16`nconfig flags 0`nconfig prefix $overlay\`nstart scan`n")
    $hostProcess.StandardInput.Flush()
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    $loaded = $false
    while ([DateTime]::UtcNow -lt $deadline -and -not $hostProcess.HasExited) {
        $hostProcess.Refresh()
        $loaded = @($hostProcess.Modules | Where-Object { $_.ModuleName -eq 'ltk_patcher_dll.dll' }).Count -eq 1
        if ($loaded) { break }
        Start-Sleep -Milliseconds 100
    }
    if (-not $loaded) { throw 'LTK DLL did not load into its host within 15 seconds' }
    Start-Sleep -Milliseconds 500
    if ($hostProcess.HasExited) { throw 'LTK host exited before Stop' }
    $hostProcess.StandardInput.WriteLine('stop')
    $hostProcess.StandardInput.Close()
    if (-not $hostProcess.WaitForExit(5000)) { throw 'LTK host did not stop on request' }
    if ($hostProcess.ExitCode -ne 0) { throw "LTK host exited with $($hostProcess.ExitCode)" }
} catch {
    $failure = $_
} finally {
    if ($started -and -not $hostProcess.HasExited) {
        $hostProcess.Kill()
        [void]$hostProcess.WaitForExit(5000)
    }
    [void][EngineTestErrorMode]::SetErrorMode($oldMode)
    Remove-Item $overlay -Recurse -Force
}
$output = if ($stdout) { $stdout.GetAwaiter().GetResult() } else { '' }
$errors = if ($stderr) { $stderr.GetAwaiter().GetResult() } else { '' }
$hostProcess.Dispose()
Write-Output $output
if ($errors) { Write-Output $errors }
if ($failure) { throw $failure }
if ($output -notmatch '(?m)^status\s+\S+\s+injecting\s') {
    throw 'Host did not acknowledge scanning after loading its DLL'
}
if (($output + $errors) -match '(?im)^error\s|^status\s+\S+\s+failed\s') {
    throw 'LTK reported a startup error'
}
Write-Output 'PASS: bundled DLL loaded, host acknowledged scanning, Stop exited cleanly. No game was used.'
