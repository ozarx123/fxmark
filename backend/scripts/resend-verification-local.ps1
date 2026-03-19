# Resend verification email — works around PowerShell + curl JSON quoting issues.
# From backend/:     .\scripts\resend-verification-local.ps1 -Email "you@example.com"
# From repo root:    .\scripts\resend-verification-local.ps1 -Email "you@example.com"  (uses root scripts/ wrapper)
# Requires: backend running (npm run dev), Mongo + Gmail in .env
param(
  [Parameter(Mandatory = $true)]
  [string]$Email
)
$ErrorActionPreference = 'Stop'
$uri = 'http://localhost:3000/api/auth/resend-verification'
$body = @{ email = $Email } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json; charset=utf-8' -Body $body
