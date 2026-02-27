# Fix Twelve Data API key in GCP Secret Manager (removes BOM/newline issues)
# Usage: .\scripts\fix-twelve-data-secret.ps1
# Or:   .\scripts\fix-twelve-data-secret.ps1 -Key "your_key_here"

param([string]$Key = "")

if (-not $Key) {
  # Try to read from backend .env
  $envPath = Join-Path $PSScriptRoot "..\backend\.env"
  if (Test-Path $envPath) {
    $line = Get-Content $envPath | Where-Object { $_ -match "^TWELVE_DATA_API_KEY=(.+)$" } | Select-Object -First 1
    if ($line -match "=(.+)$") { $Key = $matches[1].Trim() }
  }
}

if (-not $Key) {
  Write-Host "Usage: .\scripts\fix-twelve-data-secret.ps1 -Key `"your_twelvedata_api_key`""
  Write-Host "Or ensure backend\.env has TWELVE_DATA_API_KEY=..."
  exit 1
}

$Key = $Key.Trim()
$tmp = [System.IO.Path]::GetTempFileName()

try {
  # Write raw bytes - no BOM, no newline
  [System.IO.File]::WriteAllText($tmp, $Key, [System.Text.UTF8Encoding]::new($false))
  Get-Content $tmp -Raw | gcloud secrets versions add twelve-data-api-key --data-file=-
  Write-Host "Secret updated. Redeploy: .\docker\deploy.ps1"
} finally {
  Remove-Item $tmp -ErrorAction SilentlyContinue
}
