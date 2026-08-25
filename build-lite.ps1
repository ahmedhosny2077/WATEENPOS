# WATEEN POS - Quick Lite Build
# Produces only the thin/lite installer (faster, smaller)
# Usage: .\build-lite.ps1

$ErrorActionPreference = "Stop"
$version = (Get-Content "src-tauri\Cargo.toml" | Select-String 'version = "(.+)"' | Select-Object -First 1).Matches.Groups[1].Value

Write-Host "Building WATEEN POS v$version (Lite)..." -ForegroundColor Cyan

npm run tauri build 2>&1 | ForEach-Object { Write-Host $_ }

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

$nsisOutput = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($nsisOutput) {
    if (!(Test-Path "release")) { New-Item -ItemType Directory -Path "release" | Out-Null }
    $liteName = "WATEEN_POS-Setup-Lite-v$version.exe"
    Copy-Item $nsisOutput.FullName "release\$liteName"
    $size = [math]::Round((Get-Item "release\$liteName").Length / 1MB, 1)
    Write-Host ""
    Write-Host "Done! release\$liteName ($size MB)" -ForegroundColor Green
} else {
    Write-Host "Installer not found in bundle output!" -ForegroundColor Red
}
