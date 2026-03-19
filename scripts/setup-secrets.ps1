# FXMARK - Create GCP Secret Manager secrets for deployment
# Run once before first deploy. Replace placeholder values with real secrets.

param(
    [string]$ConnectionString = "",
    [string]$JwtSecret = "",
    [string]$TwelveDataApiKey = "",
    [string]$FinnhubApiKey = ""
)

$ErrorActionPreference = "Stop"

if (-not $ConnectionString) {
    $ConnectionString = Read-Host "MongoDB CONNECTION_STRING (e.g. mongodb+srv://user:pass@cluster.mongodb.net/fxmark)"
}
if (-not $JwtSecret) {
    $JwtSecret = Read-Host "JWT_SECRET (min 32 characters)"
}

if ($JwtSecret.Length -lt 32) {
    Write-Error "JWT_SECRET must be at least 32 characters"
    exit 1
}

Write-Host "Creating secrets in Secret Manager..." -ForegroundColor Yellow

# Enable API if needed
gcloud services enable secretmanager.googleapis.com --quiet

# Create or update mongo-uri (suppress error when secret doesn't exist)
$prevErr = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
gcloud secrets describe mongo-uri 2>$null | Out-Null
$mongoExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevErr

if ($mongoExists) {
    $ConnectionString | gcloud secrets versions add mongo-uri --data-file=-
    Write-Host "Updated mongo-uri" -ForegroundColor Green
} else {
    $ConnectionString | gcloud secrets create mongo-uri --data-file=-
    Write-Host "Created mongo-uri" -ForegroundColor Green
}

# Create or update jwt-secret
$ErrorActionPreference = "SilentlyContinue"
gcloud secrets describe jwt-secret 2>$null | Out-Null
$jwtExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $prevErr

if ($jwtExists) {
    $JwtSecret | gcloud secrets versions add jwt-secret --data-file=-
    Write-Host "Updated jwt-secret" -ForegroundColor Green
} else {
    $JwtSecret | gcloud secrets create jwt-secret --data-file=-
    Write-Host "Created jwt-secret" -ForegroundColor Green
}

# Twelve Data API key (optional, for market data / candles)
if ($TwelveDataApiKey) {
    $ErrorActionPreference = "SilentlyContinue"
    gcloud secrets describe twelve-data-api-key 2>$null | Out-Null
    $tdExists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $prevErr
    if ($tdExists) {
        $TwelveDataApiKey | gcloud secrets versions add twelve-data-api-key --data-file=-
        Write-Host "Updated twelve-data-api-key" -ForegroundColor Green
    } else {
        $TwelveDataApiKey | gcloud secrets create twelve-data-api-key --data-file=-
        Write-Host "Created twelve-data-api-key" -ForegroundColor Green
    }
}

# Finnhub API key (optional, WebSocket market data — see backend/src/index.js)
if ($FinnhubApiKey) {
    $ErrorActionPreference = "SilentlyContinue"
    gcloud secrets describe finnhub-api-key 2>$null | Out-Null
    $fhExists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $prevErr
    if ($fhExists) {
        $FinnhubApiKey | gcloud secrets versions add finnhub-api-key --data-file=-
        Write-Host "Updated finnhub-api-key" -ForegroundColor Green
    } else {
        $FinnhubApiKey | gcloud secrets create finnhub-api-key --data-file=-
        Write-Host "Created finnhub-api-key" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Secrets ready. Run docker\deploy.ps1 or docker\deploy-source.ps1 to deploy." -ForegroundColor Cyan
