# FXMARK - Create GCP Secret Manager secrets for deployment
# Run once before first deploy. Replace placeholder values with real secrets.

param(
    [string]$ConnectionString = "",
    [string]$JwtSecret = "",
    [string]$TwelveDataApiKey = "",
    [string]$FinnhubApiKey = "",
    [string]$ZohoMailUser = "",
    [string]$ZohoMailPassword = ""
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

# Zoho Mail (optional — verification / notifications SMTP)
if ($ZohoMailUser -and $ZohoMailPassword) {
    $ErrorActionPreference = "SilentlyContinue"
    gcloud secrets describe zoho-mail-user 2>$null | Out-Null
    $zuExists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $prevErr
    if ($zuExists) {
        $ZohoMailUser | gcloud secrets versions add zoho-mail-user --data-file=-
        Write-Host "Updated zoho-mail-user" -ForegroundColor Green
    } else {
        $ZohoMailUser | gcloud secrets create zoho-mail-user --data-file=-
        Write-Host "Created zoho-mail-user" -ForegroundColor Green
    }
    $ErrorActionPreference = "SilentlyContinue"
    gcloud secrets describe zoho-mail-password 2>$null | Out-Null
    $zpExists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = $prevErr
    if ($zpExists) {
        $ZohoMailPassword | gcloud secrets versions add zoho-mail-password --data-file=-
        Write-Host "Updated zoho-mail-password" -ForegroundColor Green
    } else {
        $ZohoMailPassword | gcloud secrets create zoho-mail-password --data-file=-
        Write-Host "Created zoho-mail-password" -ForegroundColor Green
    }
    $projNum = (gcloud projects describe --format="value(projectNumber)" 2>$null)
    if ($projNum) {
        $member = "serviceAccount:${projNum}-compute@developer.gserviceaccount.com"
        foreach ($sid in @("zoho-mail-user", "zoho-mail-password")) {
            gcloud secrets add-iam-policy-binding $sid --member=$member --role="roles/secretmanager.secretAccessor" --quiet 2>$null | Out-Null
        }
    }
}

Write-Host ""
Write-Host "Secrets ready. Run docker\deploy.ps1 or docker\deploy-source.ps1 to deploy." -ForegroundColor Cyan
Write-Host "Zoho from backend\.env: .\scripts\fix-zoho-secrets.ps1" -ForegroundColor DarkGray
