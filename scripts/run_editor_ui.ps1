param([string]$Python = 'python', [switch]$LiveOnly)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
if (Get-NetTCPConnection -State Listen -LocalPort 9222 -ErrorAction SilentlyContinue) {
    throw 'Port 9222 is already in use; no application was stopped.'
}
$testDir = Join-Path $workspace ('.tools\editor-ui-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $testDir | Out-Null
$env:GROWLOG_TEST_DATA_DIR = Join-Path $testDir 'data'
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $testDir 'webview'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
$child = $null
Push-Location -LiteralPath $workspace
try {
    $child = Start-Process -FilePath (Join-Path $workspace 'src-tauri\target\debug\growlog.exe') -WindowStyle Hidden -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($child.HasExited) { throw 'The isolated test app exited early.' }
        try {
            $pages = Invoke-RestMethod 'http://127.0.0.1:9222/json' -TimeoutSec 1
            if ($pages.Count -gt 0) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Test app did not become ready.' }
    $tests = if ($LiveOnly) { @('test_live_markdown.py') } else { @('test_desktop.py', 'test_editor_safety.py', 'test_live_markdown.py') }
    foreach ($test in $tests) {
        & $Python (Join-Path $PSScriptRoot $test)
        if ($LASTEXITCODE -ne 0) { throw "$test failed." }
    }
} finally {
    if ($child -and -not $child.HasExited) { Stop-Process -Id $child.Id -Force }
    Pop-Location
}
