# NadaBramha — One-command setup (Windows PowerShell)
# Usage: .\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  NadaBramha Setup" -ForegroundColor Cyan
Write-Host "  =================" -ForegroundColor DarkGray
Write-Host ""

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [x] Node.js not found. Install it from https://nodejs.org" -ForegroundColor Red
    exit 1
}

$nodeVersion = (node -v) -replace 'v', ''
$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 18) {
    Write-Host "  [x] Node.js $nodeVersion is too old. NadaBramha needs v18+." -ForegroundColor Red
    exit 1
}
Write-Host "  [ok] Node.js v$nodeVersion" -ForegroundColor Green

# Check npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "  [x] npm not found." -ForegroundColor Red
    exit 1
}
Write-Host "  [ok] npm $(npm -v)" -ForegroundColor Green

# Install dependencies
Write-Host ""
Write-Host "  Installing dependencies..." -ForegroundColor Yellow
npm install --loglevel=error
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [x] npm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "  [ok] Dependencies installed" -ForegroundColor Green

# Build frontend
Write-Host ""
Write-Host "  Building frontend..." -ForegroundColor Yellow
npx vite build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [x] Build failed." -ForegroundColor Red
    exit 1
}
Write-Host "  [ok] Frontend built" -ForegroundColor Green

# Start
Write-Host ""
Write-Host "  Starting NadaBramha..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Open http://localhost:3901 in your browser" -ForegroundColor Cyan
Write-Host ""

npm run dev
