param([Parameter(Mandatory)][string]$BinaryDirectory)
$ErrorActionPreference = 'Stop'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('cstmSKN missing DLL ' + [guid]::NewGuid())
New-Item -ItemType Directory $testRoot | Out-Null
$process = [Diagnostics.Process]::new()
$started = $false
try {
    # Deliberately omit the DLL; the fixed fixture is the only possible target.
    Copy-Item (Join-Path $BinaryDirectory 'cstm-injector-prototype.exe') $testRoot
    Copy-Item (Join-Path $BinaryDirectory 'cstm-injector-fixture.exe') $testRoot
    $process.StartInfo = [Diagnostics.ProcessStartInfo]::new((Join-Path $testRoot 'cstm-injector-prototype.exe'))
    $process.StartInfo.Arguments = '--self-test'
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $started = $process.Start()
    if (-not $started) { throw 'Could not start the failure-test host' }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(20000)) { throw 'Missing DLL failure hung instead of returning an error' }
    $output = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 1 -or $output -notmatch 'Windows error 0x0000007e') {
        throw "Missing DLL did not preserve ERROR_MOD_NOT_FOUND: $output"
    }
    $fixturePath = Join-Path $testRoot 'cstm-injector-fixture.exe'
    $remaining = @(Get-Process -Name 'cstm-injector-fixture' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $fixturePath })
    if ($remaining.Count -ne 0) { throw 'Failed startup left its fixture running' }
    Write-Output 'PASS: missing DLL reports original Windows error 126 after cleanup; no fixture remains.'
} finally {
    if ($started -and -not $process.HasExited) {
        $process.Kill()
        [void]$process.WaitForExit(5000)
    }
    $process.Dispose()
    Remove-Item $testRoot -Recurse -Force
}
