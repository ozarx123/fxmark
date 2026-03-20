# Resend verification email (local backend :3000).
# Run from repo root:  .\scripts\resend-verification-local.ps1 -Email "you@example.com"
# Requires: cd backend && npm run dev, Mongo + Zoho Mail in backend/.env
param(
  [Parameter(Mandatory = $true)]
  [string]$Email
)
$inner = Join-Path $PSScriptRoot '..\backend\scripts\resend-verification-local.ps1'
if (-not (Test-Path $inner)) {
  Write-Error "Not found: $inner"
  exit 1
}
& $inner -Email $Email
