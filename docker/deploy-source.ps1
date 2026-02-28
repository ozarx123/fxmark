# FXMARK Backend - Deploy latest code to GCP Cloud Run (no local Docker)
# Uploads repo; GCP Cloud Build builds with YOUR Dockerfile.backend.prod and deploys.
# Same safe image as deploy.ps1 (non-root, production deps only), without building locally.

param(
    [string]$ProjectId = "",
    [string]$Region = "us-central1",
    [string]$ServiceName = "fxmark-backend"
)

$ErrorActionPreference = "Stop"

if (-not $ProjectId) {
    $ProjectId = gcloud config get-value project 2>$null
    if (-not $ProjectId) {
        Write-Error "Set GCP project: `$env:PROJECT_ID = 'your-project-id' or pass -ProjectId 'your-project-id'"
        exit 1
    }
}

$repoRoot = Join-Path $PSScriptRoot ".."
$dockerfilePath = Join-Path $PSScriptRoot "Dockerfile.backend.prod"
if (-not (Test-Path $dockerfilePath)) {
    Write-Error "Dockerfile not found: $dockerfilePath"
    exit 1
}

Write-Host "=== FXMARK – Deploy latest (build in GCP, same Dockerfile) ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectId | Region: $Region | Service: $ServiceName"
Write-Host "Source: repo root | Dockerfile: docker/Dockerfile.backend.prod"
Write-Host ""

$deployArgs = @(
    "run", "deploy", $ServiceName,
    "--source=$repoRoot",
    "--dockerfile=docker/Dockerfile.backend.prod",
    "--region=$Region",
    "--platform=managed",
    "--allow-unauthenticated",
    "--port=8080",
    "--set-env-vars=NODE_ENV=production,TWELVE_DATA_WS=false",
    "--timeout=3600",
    "--no-use-http2",
    "--cpu-boost",
    "--memory=512Mi"
)

$prevErr = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
gcloud secrets describe mongo-uri 2>$null | Out-Null
$hasMongo = $LASTEXITCODE -eq 0
gcloud secrets describe jwt-secret 2>$null | Out-Null
$hasJwt = $LASTEXITCODE -eq 0
gcloud secrets describe twelve-data-api-key 2>$null | Out-Null
$hasTwelveData = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevErr
if ($hasMongo) { $deployArgs += "--set-secrets=CONNECTION_STRING=mongo-uri:latest" }
if ($hasJwt) { $deployArgs += "--set-secrets=JWT_SECRET=jwt-secret:latest" }
if ($hasTwelveData) { $deployArgs += "--set-secrets=TWELVE_DATA_API_KEY=twelve-data-api-key:latest" }

& gcloud @deployArgs
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "=== Deployment complete ===" -ForegroundColor Green
$url = gcloud run services describe $ServiceName --region=$Region --format="value(status.url)" 2>$null
if ($url) { Write-Host "Service URL: $url" -ForegroundColor Cyan }
