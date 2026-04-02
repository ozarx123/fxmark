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
$cloudbuildPath = Join-Path $PSScriptRoot "cloudbuild-backend.yaml"
if (-not (Test-Path $cloudbuildPath)) {
    Write-Error "Cloud Build config not found: $cloudbuildPath"
    exit 1
}

$ImageName = "$Region-docker.pkg.dev/$ProjectId/fxmark/backend:latest"
$RepoName = "fxmark"

Write-Host '=== FXMARK - Deploy latest (build in GCP, same Dockerfile) ===' -ForegroundColor Cyan
Write-Host "Project: $ProjectId | Region: $Region | Service: $ServiceName"
Write-Host ''

# Ensure Artifact Registry repo exists
$prevErr = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
gcloud artifacts repositories describe $RepoName --location=$Region 2>$null | Out-Null
$repoExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevErr
if (-not $repoExists) {
    Write-Host "Creating Artifact Registry repository: $RepoName ..." -ForegroundColor Yellow
    gcloud artifacts repositories create $RepoName --repository-format=docker --location=$Region --description="FXMARK container images"
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host "Building image in Cloud Build..." -ForegroundColor Yellow
Push-Location $repoRoot
try {
    gcloud builds submit --config=docker/cloudbuild-backend.yaml --substitutions="_REGION=$Region" .
    if ($LASTEXITCODE -ne 0) { exit 1 }
} finally {
    Pop-Location
}
Write-Host "Build OK" -ForegroundColor Green

$deployArgs = @(
    "run", "deploy", $ServiceName,
    "--image=$ImageName",
    "--region=$Region",
    "--platform=managed",
    "--allow-unauthenticated",
    "--port=8080",
    "--timeout=3600",
    "--no-use-http2",
    "--session-affinity",
    "--cpu-boost",
    "--memory=512Mi"
)

# Use --update-env-vars (not --set-env-vars) so we do not wipe REDIS_* and other console-set vars
$envPairs = @("NODE_ENV=production", "TWELVE_DATA_WS=false")
$ErrorActionPreference = "SilentlyContinue"
gcloud compute networks vpc-access connectors describe fxmark-run-connector --region=$Region 2>$null | Out-Null
$hasVpcConnector = $LASTEXITCODE -eq 0
gcloud redis instances describe fxmark-redis --region=$Region 2>$null | Out-Null
$hasRedisInst = $LASTEXITCODE -eq 0
$ErrorActionPreference = "Stop"
if ($hasVpcConnector) {
    $deployArgs += "--vpc-connector=fxmark-run-connector"
    $deployArgs += "--vpc-egress=private-ranges-only"
}
if ($hasVpcConnector -and $hasRedisInst) {
    $redisHost = (gcloud redis instances describe fxmark-redis --region=$Region --format="value(host)" 2>$null)
    if ($redisHost) {
        $envPairs += "REDIS_HOST=$redisHost"
        $envPairs += "REDIS_PORT=6379"
    }
}
$deployArgs += "--update-env-vars=" + ($envPairs -join ",")

$prevErr = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
gcloud secrets describe mongo-uri 2>$null | Out-Null
$hasMongo = $LASTEXITCODE -eq 0
gcloud secrets describe jwt-secret 2>$null | Out-Null
$hasJwt = $LASTEXITCODE -eq 0
gcloud secrets describe twelve-data-api-key 2>$null | Out-Null
$hasTwelveData = $LASTEXITCODE -eq 0
gcloud secrets describe finnhub-api-key 2>$null | Out-Null
$hasFinnhub = $LASTEXITCODE -eq 0
gcloud secrets describe zoho-mail-user 2>$null | Out-Null
$hasZohoUser = $LASTEXITCODE -eq 0
gcloud secrets describe zoho-mail-password 2>$null | Out-Null
$hasZohoPass = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevErr
$secretPairs = @()
if ($hasMongo) { $secretPairs += "CONNECTION_STRING=mongo-uri:latest" }
if ($hasJwt) { $secretPairs += "JWT_SECRET=jwt-secret:latest" }
if ($hasTwelveData) { $secretPairs += "TWELVE_DATA_API_KEY=twelve-data-api-key:latest" }
if ($hasFinnhub) { $secretPairs += "FINNHUB_API_KEY=finnhub-api-key:latest" }
if ($hasZohoUser -and $hasZohoPass) {
    $secretPairs += "ZOHO_MAIL_USER=zoho-mail-user:latest"
    $secretPairs += "ZOHO_MAIL_PASSWORD=zoho-mail-password:latest"
} elseif ($hasZohoUser -or $hasZohoPass) {
    Write-Warning "Only one of zoho-mail-user / zoho-mail-password exists in Secret Manager; skipping Zoho (create both for SMTP)."
}
if ($secretPairs.Count -gt 0) {
    $deployArgs += "--set-secrets=" + ($secretPairs -join ",")
}

& gcloud @deployArgs
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ''
Write-Host '=== Deployment complete ===' -ForegroundColor Green
$url = gcloud run services describe $ServiceName --region=$Region --format='value(status.url)' 2>$null
if ($url) { Write-Host ('Service URL: ' + $url) -ForegroundColor Cyan }
