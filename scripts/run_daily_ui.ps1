param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
if (Get-NetTCPConnection -State Listen -LocalPort 9224 -ErrorAction SilentlyContinue) {
    throw 'Port 9224 is already in use; no application was stopped.'
}
$testDir = Join-Path $workspace ('.tools\daily-ui-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $testDir | Out-Null
$env:GROWLOG_TEST_DATA_DIR = Join-Path $testDir 'data'
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $testDir 'webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9224'
$child = $null
Push-Location -LiteralPath $workspace
try {
    $child = Start-Process -FilePath (Join-Path $workspace 'src-tauri\target\debug\growlog.exe') -WindowStyle Hidden -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($child.HasExited) { throw 'The isolated test app exited early.' }
        try {
            $pages = Invoke-RestMethod 'http://127.0.0.1:9224/json' -TimeoutSec 1
            if ($pages.Count -gt 0) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Test app did not become ready.' }
    & $Python (Join-Path $PSScriptRoot 'test_daily_tasks.py')
    if ($LASTEXITCODE -ne 0) { throw 'Daily task UI verification failed.' }
} finally {
    # Only our own debug child is stopped; the installed/portable app is untouched.
    if ($child -and -not $child.HasExited) { Stop-Process -Id $child.Id -Force }
    Pop-Location
}
