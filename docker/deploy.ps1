# FXMARK Backend - GCP Cloud Run Deployment Script
# Prerequisites: Docker, gcloud CLI, GCP project with billing

param(
    [string]$ProjectId = "",
    [string]$Region = "us-central1",
    [string]$ServiceName = "fxmark-backend",
    [switch]$BuildOnly,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Get project from gcloud if not provided
if (-not $ProjectId) {
    $ProjectId = gcloud config get-value project 2>$null
    if (-not $ProjectId) {
        Write-Error "Set GCP project: `$env:PROJECT_ID = 'your-project-id' or pass -ProjectId 'your-project-id'"
        exit 1
    }
}

$ImageName = "$Region-docker.pkg.dev/$ProjectId/fxmark/backend:latest"
$RepoName = "fxmark"

Write-Host "=== FXMARK GCP Deployment ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectId | Region: $Region | Service: $ServiceName"
Write-Host ""

# Step 1: Build
if (-not $SkipBuild) {
    Write-Host "[1/4] Building Docker image..." -ForegroundColor Yellow
    docker build -f docker/Dockerfile.backend.prod -t fxmark-backend:latest .
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "Build OK" -ForegroundColor Green
} else {
    Write-Host "[1/4] Skipping build (--SkipBuild)" -ForegroundColor Gray
}

if ($BuildOnly) {
    Write-Host "Build complete. Exiting (--BuildOnly)" -ForegroundColor Green
    exit 0
}

# Step 2: Ensure Artifact Registry repo exists
Write-Host "[2/4] Ensuring Artifact Registry repository..." -ForegroundColor Yellow
$prevErr = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
gcloud artifacts repositories describe $RepoName --location=$Region 2>$null | Out-Null
$repoExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevErr
if (-not $repoExists) {
    gcloud artifacts repositories create $RepoName `
        --repository-format=docker `
        --location=$Region `
        --description="FXMARK container images"
    if ($LASTEXITCODE -ne 0) { exit 1 }
}
gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet
Write-Host "Registry OK" -ForegroundColor Green

# Step 3: Tag and Push
Write-Host "[3/4] Pushing image to Artifact Registry..." -ForegroundColor Yellow
docker tag fxmark-backend:latest $ImageName
docker push $ImageName
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Push OK" -ForegroundColor Green

# Step 4: Deploy to Cloud Run (Cloud Run uses PORT=8080 by default)
Write-Host "[4/4] Deploying to Cloud Run..." -ForegroundColor Yellow
$deployArgs = @(
    "run", "deploy", $ServiceName,
    "--image=$ImageName",
    "--region=$Region",
    "--platform=managed",
    "--allow-unauthenticated",
    "--port=8080",
    "--set-env-vars=NODE_ENV=production",
    "--timeout=300",
    "--cpu-boost",
    "--memory=512Mi"
)

# Add secrets if they exist in Secret Manager
$prevErr = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
gcloud secrets describe mongo-uri 2>$null | Out-Null
$hasMongo = $LASTEXITCODE -eq 0
gcloud secrets describe jwt-secret 2>$null | Out-Null
$hasJwt = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevErr
if ($hasMongo) { $deployArgs += "--set-secrets=CONNECTION_STRING=mongo-uri:latest" }
if ($hasJwt) { $deployArgs += "--set-secrets=JWT_SECRET=jwt-secret:latest" }

& gcloud @deployArgs
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "=== Deployment complete ===" -ForegroundColor Green
$url = gcloud run services describe $ServiceName --region=$Region --format="value(status.url)" 2>$null
if ($url) { Write-Host "Service URL: $url" -ForegroundColor Cyan }
Write-Host ""
Write-Host "If CONNECTION_STRING/JWT_SECRET are not set, add them via:"
Write-Host "  gcloud run services update $ServiceName --region=$Region --set-env-vars=CONNECTION_STRING=...,JWT_SECRET=..."
Write-Host "  Or use Secret Manager: scripts/setup-secrets.ps1"
