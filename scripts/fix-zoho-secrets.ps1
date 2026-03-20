# Create/update Zoho Mail credentials in GCP Secret Manager (from backend/.env or parameters).
# Cloud Run env: ZOHO_MAIL_USER, ZOHO_MAIL_PASSWORD
#
# Usage: .\scripts\fix-zoho-secrets.ps1
# Or:    .\scripts\fix-zoho-secrets.ps1 -User "noreply@domain.com" -Password "secret"

param(
  [string]$User = "",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"
$envPath = Join-Path $PSScriptRoot "..\backend\.env"

function Get-EnvValue([string]$key) {
  if (-not (Test-Path $envPath)) { return "" }
  $line = Get-Content $envPath -ErrorAction SilentlyContinue | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
  if (-not $line) { return "" }
  $idx = $line.IndexOf("=")
  if ($idx -lt 0) { return "" }
  return $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
}

if (-not $User) { $User = Get-EnvValue "ZOHO_MAIL_USER" }
if (-not $Password) { $Password = Get-EnvValue "ZOHO_MAIL_PASSWORD" }

if (-not $User -or -not $Password) {
  Write-Host "Set Zoho values in backend\.env (ZOHO_MAIL_USER, ZOHO_MAIL_PASSWORD) or pass -User and -Password."
  exit 1
}

function Set-OneSecret([string]$secretId, [string]$value) {
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, $value, [System.Text.UTF8Encoding]::new($false))
    $ErrorActionPreference = "SilentlyContinue"
    gcloud secrets describe $secretId 2>$null | Out-Null
    $exists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = "Stop"
    if ($exists) {
      Get-Content $tmp -Raw | gcloud secrets versions add $secretId --data-file=-
    } else {
      Get-Content $tmp -Raw | gcloud secrets create $secretId --data-file=-
    }
    Write-Host "OK: $secretId" -ForegroundColor Green
  } finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
  }
}

Write-Host "Enabling Secret Manager API (if needed)..." -ForegroundColor Yellow
gcloud services enable secretmanager.googleapis.com --quiet

Set-OneSecret "zoho-mail-user" $User.Trim()
Set-OneSecret "zoho-mail-password" $Password.Trim()

$projectId = (gcloud config get-value project 2>$null).Trim()
if (-not $projectId) {
  Write-Warning "No gcloud project set. Run: gcloud config set project YOUR_PROJECT_ID — then re-run this script to grant Cloud Run access to the secrets, or run .\scripts\grant-zoho-secrets-access.ps1"
} else {
  $projNum = (gcloud projects describe $projectId --format="value(projectNumber)" 2>$null).Trim()
  if (-not $projNum) {
    Write-Warning "Could not read project number for '$projectId'. Grant IAM manually or run .\scripts\grant-zoho-secrets-access.ps1"
  } else {
    $member = "serviceAccount:${projNum}-compute@developer.gserviceaccount.com"
    foreach ($sid in @("zoho-mail-user", "zoho-mail-password")) {
      gcloud secrets add-iam-policy-binding $sid --project=$projectId `
        --member=$member `
        --role="roles/secretmanager.secretAccessor" --quiet 2>$null | Out-Null
    }
    Write-Host "Ensured Secret Accessor for $member" -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host "Zoho secrets saved. Wire Cloud Run (merge with existing secrets):" -ForegroundColor Cyan
Write-Host '  gcloud run services update fxmark-backend --region us-central1 --update-secrets=ZOHO_MAIL_USER=zoho-mail-user:latest,ZOHO_MAIL_PASSWORD=zoho-mail-password:latest'
Write-Host "Or redeploy: .\docker\deploy-source.ps1" -ForegroundColor DarkGray
