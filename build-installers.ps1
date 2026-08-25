# WATEEN POS - Build Script
# Produces TWO installers: Thin (Lite) and Full (Offline)
# Usage: .\build-installers.ps1

$ErrorActionPreference = "Stop"
$version = (Get-Content "src-tauri\Cargo.toml" | Select-String 'version = "(.+)"' | Select-Object -First 1).Matches.Groups[1].Value
$outputDir = "release"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  WATEEN POS Build - v$version" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Create output directory
if (!(Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir | Out-Null }

# --- Check prerequisites for Full build ---
$vcRedistPath = "src-tauri\prerequisites\vc_redist.x64.exe"
if (!(Test-Path $vcRedistPath)) {
    Write-Host "[!] vc_redist.x64.exe not found in src-tauri\prerequisites\" -ForegroundColor Yellow
    Write-Host "    Downloading from Microsoft..." -ForegroundColor Yellow
    $vcUrl = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
    try {
        Invoke-WebRequest -Uri $vcUrl -OutFile $vcRedistPath -UseBasicParsing
        Write-Host "    Downloaded successfully." -ForegroundColor Green
    } catch {
        Write-Host "    [ERROR] Failed to download. Please manually place vc_redist.x64.exe in src-tauri\prerequisites\" -ForegroundColor Red
        Write-Host "    Download from: $vcUrl" -ForegroundColor Red
        exit 1
    }
}

# --- Store original tauri.conf.json ---
$confPath = "src-tauri\tauri.conf.json"
$originalConf = Get-Content $confPath -Raw

# ============================================
# BUILD 1: THIN / LITE INSTALLER
# ============================================
Write-Host ""
Write-Host "[1/2] Building THIN (Lite) installer..." -ForegroundColor Green
Write-Host "       WebView2: downloadBootstrapper (requires internet)" -ForegroundColor DarkGray

# Modify tauri.conf.json for thin build
$thinConf = $originalConf -replace '"type":\s*"embedBootstrapper"', '"type": "downloadBootstrapper"'
$thinConf = $thinConf -replace '"silent":\s*true', '"silent": true'
Set-Content $confPath -Value $thinConf -NoNewline

try {
    npm run tauri build 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) { throw "Thin build failed" }
} finally {
    # Restore original config
    Set-Content $confPath -Value $originalConf -NoNewline
}

# Find and rename the thin installer
$nsisOutput = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($nsisOutput) {
    $liteName = "WATEEN_POS-Setup-Lite-v$version.exe"
    Copy-Item $nsisOutput.FullName "$outputDir\$liteName"
    $liteSize = [math]::Round((Get-Item "$outputDir\$liteName").Length / 1MB, 1)
    Write-Host "  -> $liteName ($liteSize MB)" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Thin installer not found!" -ForegroundColor Red
}

# ============================================
# BUILD 2: FULL / OFFLINE INSTALLER
# ============================================
Write-Host ""
Write-Host "[2/2] Building FULL (Offline) installer..." -ForegroundColor Green
Write-Host "       WebView2: offlineInstaller (bundled)" -ForegroundColor DarkGray
Write-Host "       VC++ Redistributable: bundled" -ForegroundColor DarkGray

# Modify tauri.conf.json for full build
$fullConf = $originalConf -replace '"type":\s*"embedBootstrapper"', '"type": "offlineInstaller"'
$fullConf = $fullConf -replace '"silent":\s*true', '"silent": true'
# Add NSIS installer hooks path
$fullConf = $fullConf -replace '"nsis":\s*\{', "`"nsis`": {`n        `"installerIcon`": `"icons/icon.ico`","
Set-Content $confPath -Value $fullConf -NoNewline

try {
    npm run tauri build 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) { throw "Full build failed" }
} finally {
    # Restore original config
    Set-Content $confPath -Value $originalConf -NoNewline
}

# Find and rename the full installer
$nsisOutput = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($nsisOutput) {
    $fullName = "WATEEN_POS-Setup-Full-v$version.exe"
    Copy-Item $nsisOutput.FullName "$outputDir\$fullName"
    $fullSize = [math]::Round((Get-Item "$outputDir\$fullName").Length / 1MB, 1)
    Write-Host "  -> $fullName ($fullSize MB)" -ForegroundColor Green
} else {
    Write-Host "  [ERROR] Full installer not found!" -ForegroundColor Red
}

# ============================================
# SUMMARY
# ============================================
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Output directory: .\$outputDir\" -ForegroundColor White
if (Test-Path "$outputDir\WATEEN_POS-Setup-Lite-v$version.exe") {
    Write-Host "  [Lite]  WATEEN_POS-Setup-Lite-v$version.exe ($liteSize MB)" -ForegroundColor Green
}
if (Test-Path "$outputDir\WATEEN_POS-Setup-Full-v$version.exe") {
    Write-Host "  [Full]  WATEEN_POS-Setup-Full-v$version.exe ($fullSize MB)" -ForegroundColor Green
}
Write-Host ""
Write-Host "  Upload both to GitHub Release v$version" -ForegroundColor Yellow
Write-Host "  Then update version.json with the new version." -ForegroundColor Yellow
Write-Host ""
