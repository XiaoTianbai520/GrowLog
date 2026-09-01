# Installs only when no existing installation exists, preserves all user data,
# checks upgrade/uninstall/reinstall, and leaves the final application installed.
param([switch]$Run, [switch]$AllowRunningPortable)
$ErrorActionPreference = 'Stop'
if (-not $Run) { throw 'Use -Run to explicitly run the real current-user installation test.' }
$workspace = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $workspace 'package.json') -Raw | ConvertFrom-Json).version
$setup = Join-Path $workspace "release\枝序-$version-Setup.exe"
$installDir = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\枝序'))
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\枝序'
$dataDir = Join-Path $env:APPDATA 'app.growlog.desktop'
if (-not (Test-Path -LiteralPath $setup)) { throw 'Setup has not been built.' }
if ((Test-Path -LiteralPath $uninstallKey) -or (Test-Path -LiteralPath $installDir)) {
    throw 'An installation already exists. This test will not overwrite it.'
}
$portablePath = Join-Path $workspace 'release\枝序.exe'
$running = @(Get-Process -Name growlog,枝序 -ErrorAction SilentlyContinue)
foreach ($process in $running) {
    if (-not $AllowRunningPortable -or $process.Path -ne $portablePath) {
        throw 'Close the running installed app before testing. No processes will be stopped.'
    }
}
$expectedRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA) + [IO.Path]::DirectorySeparatorChar
if (-not $installDir.StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected installation target.' }

function Get-DataHashes {
    $result = @{}
    if (Test-Path -LiteralPath $dataDir) {
        Get-ChildItem -LiteralPath $dataDir -Recurse -File | ForEach-Object {
            $result[$_.FullName.Substring($dataDir.Length)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    }
    return $result
}
$baseline = Get-DataHashes
$backupDir = Join-Path $workspace ('.tools\installer-baseline-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $backupDir | Out-Null
if (Test-Path -LiteralPath $dataDir) { Copy-Item -LiteralPath $dataDir -Destination $backupDir -Recurse }
function Assert-DataPreserved {
    $current = Get-DataHashes
    if ($current.Count -ne $baseline.Count) { throw 'User data file count changed during installation.' }
    foreach ($key in $baseline.Keys) {
        if ($current[$key] -ne $baseline[$key]) { throw 'User data changed during installation.' }
    }
}
function Install-App {
    $child = Start-Process -FilePath $setup -ArgumentList ('/S /D=' + $installDir) -WindowStyle Hidden -PassThru
    if (-not $child.WaitForExit(120000)) { throw 'Installation did not finish in two minutes.' }
    if ($child.ExitCode -ne 0) { throw ('Installer exit code: ' + $child.ExitCode) }
    if (-not (Test-Path -LiteralPath (Join-Path $installDir 'growlog.exe'))) { throw 'Installed executable missing.' }
    if (-not (Test-Path -LiteralPath $uninstallKey)) { throw 'Uninstall entry missing.' }
    $installedHash = (Get-FileHash -LiteralPath (Join-Path $installDir 'growlog.exe') -Algorithm SHA256).Hash
    $builtHash = (Get-FileHash -LiteralPath (Join-Path $workspace 'src-tauri\target\release\growlog.exe') -Algorithm SHA256).Hash
    if ($installedHash -ne $builtHash) { throw 'Installed executable does not match the built binary.' }
    $shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) '枝序.lnk'
    if (-not (Test-Path -LiteralPath $shortcut)) { throw 'Desktop shortcut missing.' }
    $shell = New-Object -ComObject WScript.Shell
    if ($shell.CreateShortcut($shortcut).TargetPath -ne (Join-Path $installDir 'growlog.exe')) { throw 'Desktop shortcut points elsewhere.' }
    Assert-DataPreserved
}
Write-Output 'Testing first installation...'
Install-App
Write-Output 'Testing same-version covering installation...'
Install-App
Write-Output 'Testing default uninstallation with data retention...'
$uninstaller = Join-Path $installDir 'uninstall.exe'
$child = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru
$deadline = (Get-Date).AddSeconds(60)
while ((Test-Path -LiteralPath $uninstallKey) -or (Test-Path -LiteralPath (Join-Path $installDir 'growlog.exe'))) {
    if ((Get-Date) -gt $deadline) { throw 'Uninstallation did not finish.' }
    Start-Sleep -Milliseconds 300
}
Assert-DataPreserved
Write-Output 'Reinstalling the final application...'
Install-App
$report = @{
    version=$version;
    date=(Get-Date).ToString('o'); firstInstall='passed'; coveringInstall='passed';
    uninstallRetainsData='passed'; reinstall='passed'; desktopShortcut='passed';
    uninstallEntry='passed'; installedBinaryHash='passed';
    originalDataFiles=$baseline.Count; originalDataBackup=$backupDir;
    installationPath=$installDir; cleanMachineWithoutWebView='not tested'
    runningPortablePreserved=($running.Count -gt 0)
}
$reportDir = Join-Path $workspace 'test-results'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $reportDir 'installer-test-report.json') -Encoding UTF8
$report | ConvertTo-Json | Write-Output
