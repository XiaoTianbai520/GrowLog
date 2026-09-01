param([ValidateSet('dev','build','debug','test')][string]$Action = 'dev')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $workspace
try {
    $localCargo = Join-Path $workspace '.tools\cargo'
    if (Test-Path -LiteralPath (Join-Path $localCargo 'bin\cargo.exe')) {
        $env:CARGO_HOME = $localCargo
        $env:RUSTUP_HOME = Join-Path $workspace '.tools\rustup'
        $env:PATH = "$localCargo\bin;$env:PATH"
    }
    switch ($Action) {
        'dev' { npm.cmd run desktop:dev }
        'debug' { npm.cmd run tauri -- build --debug --no-bundle }
        'test' { cargo test --manifest-path src-tauri/Cargo.toml --lib }
        'build' {
            npm.cmd run desktop:build
            if ($LASTEXITCODE -ne 0) { throw '安装包构建失败' }
            $setup = Get-ChildItem -LiteralPath 'src-tauri\target\release\bundle\nsis' -Filter '*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if (-not $setup) { throw '未找到 Setup 安装包' }
            New-Item -ItemType Directory -Force release | Out-Null
            $version = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
            $destination = Join-Path $workspace "release\枝序-$version-Setup.exe"
            Copy-Item -LiteralPath $setup.FullName -Destination $destination -Force
            Get-FileHash -LiteralPath $destination -Algorithm SHA256 | Format-List
        }
    }
    if ($LASTEXITCODE -ne 0) { throw "命令失败：$LASTEXITCODE" }
} finally { Pop-Location }
