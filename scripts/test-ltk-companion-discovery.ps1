# Exercise the shipped discovery script in Windows PowerShell 5.1, with a
# controlled registry/process/signature fixture. No real apps are launched.
$ErrorActionPreference = 'Stop'
$source = Get-Content -Raw (Join-Path $PSScriptRoot '../src-tauri/src/commands/ltk_companion_inspect.ps1')
$mocks = @'
function Get-Process {
    param($Name, $ErrorAction)
    if ($env:CSTMSKN_DISCOVERY_CASE -eq 'running') { [pscustomobject]@{ Id = 12 } }
}
function Get-ItemProperty {
    param($Path, $ErrorAction)
    if ($env:CSTMSKN_DISCOVERY_CASE -eq 'running') { throw 'Must not scan registry for an existing instance' }
    [pscustomobject]@{ DisplayName = 'LTK Manager'; InstallLocation = 'C:\Program Files\LTK Manager' }
}
function Test-Path { param($LiteralPath, $PathType) $env:CSTMSKN_DISCOVERY_CASE -ne 'missing' }
function Get-Item {
    param($LiteralPath)
    $version = switch ($env:CSTMSKN_DISCOVERY_CASE) { 'old' { '1.0.0' }; 'malformed' { 'unknown' }; default { '1.30.4' } }
    $product = if ($env:CSTMSKN_DISCOVERY_CASE -eq 'other-product') { 'Other App' } else { 'LTK Manager' }
    [pscustomobject]@{ FullName = 'C:\Program Files\LTK Manager\ltk-manager.exe'; VersionInfo = @{ProductVersion = $version; ProductName = $product} }
}
function Get-AuthenticodeSignature {
    param($LiteralPath)
    [pscustomobject]@{ Status = $(if ($env:CSTMSKN_DISCOVERY_CASE -eq 'unsigned') { 'NotSigned' } else { 'Valid' }) }
}
'@
$file = Join-Path ([IO.Path]::GetTempPath()) ('cstmskn-discovery-' + [Guid]::NewGuid() + '.ps1')
try {
    [IO.File]::WriteAllText($file, $mocks + "`n" + $source, (New-Object Text.UTF8Encoding($true)))
    foreach ($case in @('missing', 'running', 'valid', 'old', 'malformed', 'unsigned', 'other-product')) {
        $env:CSTMSKN_DISCOVERY_CASE = $case
        $output = & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -File $file 2>$null
        $result = $LASTEXITCODE
        if ($case -eq 'unsigned') {
            if ($result -eq 0) { throw 'Unsigned installation was accepted' }
            continue
        }
        if ($result -ne 0) { throw "Discovery failed for $case" }
        $value = ($output -join "`n") | ConvertFrom-Json
        if ($value.running -ne ($case -eq 'running')) { throw "Wrong running state for $case" }
        if (($null -ne $value.path) -ne ($case -eq 'valid')) { throw "Wrong installation result for $case" }
    }
    Write-Host 'Passed seven companion discovery cases in Windows PowerShell.'
} finally {
    Remove-Item $file -ErrorAction SilentlyContinue
    Remove-Item Env:CSTMSKN_DISCOVERY_CASE -ErrorAction SilentlyContinue
}
