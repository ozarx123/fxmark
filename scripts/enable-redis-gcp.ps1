# FXMARK — Enable Memorystore Redis + Serverless VPC connector for Cloud Run (idempotent)
# Prerequisites: gcloud auth, project set, billing enabled
#
# Usage (defaults match DEPLOY.md / fxmark project):
#   .\scripts\enable-redis-gcp.ps1
#   .\scripts\enable-redis-gcp.ps1 -SkipRedis   # only ensure connector + print run update
#   .\scripts\enable-redis-gcp.ps1 -SkipConnector

param(
  [string]$ProjectId = "",
  [string]$Region = "us-central1",
  [string]$Network = "default",
  [string]$RedisInstanceId = "fxmark-redis",
  [string]$ConnectorId = "fxmark-run-connector",
  [string]$ConnectorRange = "10.8.0.0/28",
  [string]$ServiceName = "fxmark-backend",
  [switch]$SkipRedis,
  [switch]$SkipConnector
)

$ErrorActionPreference = "Stop"

if (-not $ProjectId) {
  $ProjectId = gcloud config get-value project 2>$null
  if (-not $ProjectId) { Write-Error "Set project: gcloud config set project YOUR_ID"; exit 1 }
}

Write-Host "=== FXMARK Redis on GCP ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectId | Region: $Region | Network: $Network"

Write-Host "`nEnabling APIs..." -ForegroundColor Yellow
gcloud services enable redis.googleapis.com vpcaccess.googleapis.com compute.googleapis.com servicenetworking.googleapis.com --quiet

if (-not $SkipRedis) {
  $ErrorActionPreference = "SilentlyContinue"
  gcloud redis instances describe $RedisInstanceId --region=$Region 2>$null | Out-Null
  $redisExists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = "Stop"
  if (-not $redisExists) {
    Write-Host "Creating Memorystore instance $RedisInstanceId (10–30+ min)..." -ForegroundColor Yellow
    gcloud redis instances create $RedisInstanceId --size=1 --region=$Region `
      --redis-version=redis_7_0 --network=projects/$ProjectId/global/networks/$Network `
      --display-name="FXMARK Redis"
    if ($LASTEXITCODE -ne 0) { exit 1 }
  } else {
    Write-Host "Redis instance already exists: $RedisInstanceId" -ForegroundColor Green
  }
}

$hostIp = (gcloud redis instances describe $RedisInstanceId --region=$Region --format="value(host)" 2>$null)
if (-not $hostIp) {
  Write-Error "Could not read Redis host. Is instance $RedisInstanceId READY in $Region?"
  exit 1
}

if (-not $SkipConnector) {
  $ErrorActionPreference = "SilentlyContinue"
  gcloud compute networks vpc-access connectors describe $ConnectorId --region=$Region 2>$null | Out-Null
  $connExists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = "Stop"
  if (-not $connExists) {
    Write-Host "Creating VPC connector $ConnectorId (range $ConnectorRange)..." -ForegroundColor Yellow
    gcloud compute networks vpc-access connectors create $ConnectorId --region=$Region `
      --network=$Network --range=$ConnectorRange --min-instances=2 --max-instances=3 --machine-type=e2-micro
    if ($LASTEXITCODE -ne 0) { exit 1 }
  } else {
    Write-Host "VPC connector already exists: $ConnectorId" -ForegroundColor Green
  }
}

Write-Host "`nRedis host: $hostIp port 6379" -ForegroundColor Cyan
Write-Host "`nApply to Cloud Run (merge with your existing flags):" -ForegroundColor Yellow
Write-Host @"
gcloud run services update $ServiceName --region=$Region `
  --vpc-connector=$ConnectorId `
  --vpc-egress=private-ranges-only `
  --update-env-vars="REDIS_HOST=$hostIp,REDIS_PORT=6379"
"@
Write-Host "`nHealth check: GET .../health/redis -> connected" -ForegroundColor DarkGray
