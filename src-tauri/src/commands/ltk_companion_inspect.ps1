# Read-only discovery. No binaries, security settings or user profiles are modified.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$running = @(Get-Process -Name 'ltk-manager' -ErrorAction SilentlyContinue).Count -gt 0
# A second invocation reveals LTK's window. Do not launch another instance.
if ($running -or $env:CSTMSKN_LTK_PROCESS_ONLY -eq '1') {
    @{ path = $null; running = $running } | ConvertTo-Json -Compress
    exit 0
}
$candidates = New-Object 'System.Collections.Generic.List[string]'
foreach ($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    foreach ($entry in @(Get-ItemProperty "$root\*" -ErrorAction SilentlyContinue)) {
        if ($entry.DisplayName -eq 'LTK Manager' -and $entry.InstallLocation) {
            $candidates.Add((Join-Path $entry.InstallLocation 'ltk-manager.exe'))
        }
    }
}
foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    if ($root) { $candidates.Add((Join-Path $root 'LTK Manager\ltk-manager.exe')) }
}
$found = $null
foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (!(Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $file = Get-Item -LiteralPath $candidate
    if ($file.VersionInfo.ProductName -ne 'LTK Manager') { continue }
    $version = $file.VersionInfo.ProductVersion -replace '-.*$', ''
    $parsed = $null
    if (![version]::TryParse($version, [ref]$parsed) -or $parsed -lt [version]'1.30.4') { continue }
    if ((Get-AuthenticodeSignature -LiteralPath $candidate).Status -ne 'Valid') {
        throw 'LTK Manager does not have a valid Windows signature.'
    }
    $found = $file.FullName
    break
}
@{ path = $found; running = $false } | ConvertTo-Json -Compress
