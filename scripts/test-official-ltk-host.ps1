# Start the actual, unchanged official host/DLL without a game or Manager UI.
$ErrorActionPreference = 'Stop'
$fixture = Join-Path $PSScriptRoot '../native-build/ltk-official-fixture'
$folder = Join-Path $env:ProgramFiles ('cstmSKN-LTK-test-' + $env:GITHUB_RUN_ID)
if (Test-Path $folder) { throw 'Host test folder already exists' }
New-Item -ItemType Directory $folder | Out-Null
$process = $null
try {
    foreach ($name in @('ltk-manager.exe', 'ltk_patcher_host.exe', 'ltk_patcher_dll.dll')) {
        Copy-Item (Join-Path $fixture $name) $folder
        if ((Get-AuthenticodeSignature (Join-Path $folder $name)).Status -ne 'Valid') { throw "Invalid official signature: $name" }
    }
    $overlay = Join-Path $folder 'overlay'
    New-Item -ItemType Directory $overlay | Out-Null
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = Join-Path $folder 'ltk_patcher_host.exe'
    $info.WorkingDirectory = $folder
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($info)
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.WriteLine("config loglevel 16`nconfig flags 4`nconfig prefix $overlay\`nstart scan")
    $process.StandardInput.Flush()
    $deadline = [DateTime]::UtcNow.AddSeconds(12)
    $ready = $false
    $lines = @()
    $pending = $process.StandardOutput.ReadLineAsync()
    while ([DateTime]::UtcNow -lt $deadline -and !$process.HasExited) {
        if ($pending.Wait(100)) {
            $line = $pending.Result
            if ($null -eq $line) { break }
            $lines += $line
            Write-Host $line
            if ($line -match '^status \S+ injecting(?: |$)') { $ready = $true; break }
            $pending = $process.StandardOutput.ReadLineAsync()
        }
    }
    if (!$process.HasExited) {
        $process.StandardInput.WriteLine('stop')
        $process.StandardInput.Close()
        if (!$process.WaitForExit(5000)) { $process.Kill(); $process.WaitForExit() }
    }
    Write-Host ($stderr.GetAwaiter().GetResult())
    Write-Host "Official host exit: $($process.ExitCode)"
    if (!$ready) { throw 'Official LTK host did not acknowledge background scanning; see the unmodified host diagnostics above.' }
    Write-Host 'Official host/DLL acknowledged scanning and stopped; no game was touched.'
} finally {
    if ($process -and !$process.HasExited) { $process.Kill(); $process.WaitForExit() }
    Remove-Item -Recurse -Force $folder
}
