# Fix / update Finnhub API key in GCP Secret Manager (no BOM / trailing newline issues)
# Usage: .\scripts\fix-finnhub-secret.ps1
# Or:    .\scripts\fix-finnhub-secret.ps1 -Key "your_key_here"

param([string]$Key = "")

if (-not $Key) {
  $envPath = Join-Path $PSScriptRoot "..\backend\.env"
  if (Test-Path $envPath) {
    $line = Get-Content $envPath | Where-Object { $_ -match "^FINNHUB_API_KEY=(.+)$" } | Select-Object -First 1
    if ($line -match "=(.+)$") { $Key = $matches[1].Trim() }
  }
}

if (-not $Key) {
  Write-Host "Usage: .\scripts\fix-finnhub-secret.ps1 -Key `"your_finnhub_api_key`""
  Write-Host "Or ensure backend\.env has FINNHUB_API_KEY=..."
  exit 1
}

$Key = $Key.Trim()
$tmp = [System.IO.Path]::GetTempFileName()

try {
  [System.IO.File]::WriteAllText($tmp, $Key, [System.Text.UTF8Encoding]::new($false))
  $ErrorActionPreference = "SilentlyContinue"
  gcloud secrets describe finnhub-api-key 2>$null | Out-Null
  $exists = $LASTEXITCODE -eq 0
  $ErrorActionPreference = "Stop"
  if ($exists) {
    Get-Content $tmp -Raw | gcloud secrets versions add finnhub-api-key --data-file=-
  } else {
    Get-Content $tmp -Raw | gcloud secrets create finnhub-api-key --data-file=-
  }

  # Cloud Run default compute SA must read the secret
  $projNum = (gcloud projects describe --format="value(projectNumber)" 2>$null)
  if ($projNum) {
    gcloud secrets add-iam-policy-binding finnhub-api-key `
      --member="serviceAccount:${projNum}-compute@developer.gserviceaccount.com" `
      --role="roles/secretmanager.secretAccessor" --quiet 2>$null | Out-Null
    Write-Host "Ensured Secret Accessor for serviceAccount:${projNum}-compute@developer.gserviceaccount.com" -ForegroundColor DarkGray
  }

  Write-Host "Secret finnhub-api-key saved. Wire Cloud Run (if not already):"
  Write-Host "  gcloud run services update fxmark-backend --region us-central1 --update-secrets=FINNHUB_API_KEY=finnhub-api-key:latest"
  Write-Host "Or redeploy: .\docker\deploy-source.ps1"
} finally {
  Remove-Item $tmp -ErrorAction SilentlyContinue
}
