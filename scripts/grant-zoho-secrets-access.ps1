# Grant Cloud Run's service account permission to read Zoho secrets in Secret Manager.
# Run from repo root: .\scripts\grant-zoho-secrets-access.ps1
#
# Error without this: Permission denied on secret ... for Revision service account ...-compute@developer.gserviceaccount.com

$ErrorActionPreference = "Stop"

$projectId = (gcloud config get-value project 2>$null).Trim()
if (-not $projectId) {
    Write-Error "Set project: gcloud config set project YOUR_PROJECT_ID"
    exit 1
}

$projNum = (gcloud projects describe $projectId --format="value(projectNumber)" 2>$null).Trim()
if (-not $projNum) {
    Write-Error "Could not read project number."
    exit 1
}

# Default Cloud Run SA (same as in your error). If you use a custom SA on the service, set $ServiceAccountEmail.
$defaultComputeSa = "${projNum}-compute@developer.gserviceaccount.com"
$ServiceAccountEmail = if ($env:CLOUD_RUN_SERVICE_ACCOUNT) { $env:CLOUD_RUN_SERVICE_ACCOUNT } else { $defaultComputeSa }

$member = "serviceAccount:$ServiceAccountEmail"
Write-Host "Project: $projectId ($projNum)" -ForegroundColor Cyan
Write-Host "Granting secretAccessor to: $member" -ForegroundColor Cyan
Write-Host ""

foreach ($secret in @("zoho-mail-user", "zoho-mail-password")) {
    $ErrorActionPreference = "SilentlyContinue"
    gcloud secrets describe $secret --project=$projectId 2>$null | Out-Null
    $exists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = "Stop"
    if (-not $exists) {
        Write-Warning "Secret '$secret' not found in project $projectId. Create it first: .\scripts\fix-zoho-secrets.ps1"
        continue
    }
    gcloud secrets add-iam-policy-binding $secret `
        --project=$projectId `
        --member=$member `
        --role="roles/secretmanager.secretAccessor"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: $secret" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Redeploy Cloud Run (or create a new revision):" -ForegroundColor Yellow
Write-Host '  gcloud run services update fxmark-backend --region us-central1 --update-secrets="ZOHO_MAIL_USER=zoho-mail-user:latest,ZOHO_MAIL_PASSWORD=zoho-mail-password:latest"'
Write-Host ""
Write-Host "If it still fails, Cloud Run may use a custom service account. Find it:" -ForegroundColor DarkGray
Write-Host '  gcloud run services describe fxmark-backend --region us-central1 --format="value(spec.template.spec.serviceAccountName)"'
Write-Host "Then: `$env:CLOUD_RUN_SERVICE_ACCOUNT='that-email@...iam.gserviceaccount.com'; .\scripts\grant-zoho-secrets-access.ps1"
