# FXMARK Backend - Build and save Docker image as a local backup
# Use when you want a copy you can run or restore without GCP.
# Restore: docker load -i docker\backups\fxmark-backend-YYYY-MM-DD.tar
# Run:     docker run -p 8080:8080 -e PORT=8080 -e CONNECTION_STRING=... fxmark-backend:backup

param(
    [string]$OutDir = "",
    [string]$Tag = "backup"
)

$ErrorActionPreference = "Stop"

$repoRoot = Join-Path $PSScriptRoot ".."
if (-not $OutDir) {
    $OutDir = Join-Path $PSScriptRoot "backups"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$date = Get-Date -Format "yyyy-MM-dd"
$tarName = "fxmark-backend-$date.tar"
$tarPath = Join-Path $OutDir $tarName

Write-Host "=== FXMARK Docker backup ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Building image..." -ForegroundColor Yellow
Push-Location $repoRoot
try {
    docker build -f docker/Dockerfile.backend.prod -t "fxmark-backend:$Tag" .
    if ($LASTEXITCODE -ne 0) { exit 1 }
} finally {
    Pop-Location
}
Write-Host "Build OK" -ForegroundColor Green

Write-Host "[2/2] Saving to $tarPath ..." -ForegroundColor Yellow
docker save "fxmark-backend:$Tag" -o $tarPath
if ($LASTEXITCODE -ne 0) { exit 1 }
$size = (Get-Item $tarPath).Length / 1MB
Write-Host "Saved ($([math]::Round($size, 2)) MB)" -ForegroundColor Green

Write-Host ""
Write-Host "=== Backup complete ===" -ForegroundColor Green
Write-Host "To restore:  docker load -i `"$tarPath`""
Write-Host "To run:      docker run -p 8080:8080 -e PORT=8080 -e CONNECTION_STRING=<your-uri> fxmark-backend:$Tag"
