param(
  [string]$MongoUri = "mongodb+srv://fxmark:2iChFAzSrqrrayJk@cluster0.vgk7g2j.mongodb.net/?appName=Cluster0",
  [string]$SourceDb = "test",
  [string]$TargetDb = "test_staging_20260331104711",
  [string]$DumpRoot = ".\\dump_staging_refresh"
)

$ErrorActionPreference = "Stop"

$toolsBin = "C:\Program Files\MongoDB\Tools\100\bin"
$mongodump = Join-Path $toolsBin "mongodump.exe"
$mongorestore = Join-Path $toolsBin "mongorestore.exe"

if (!(Test-Path $mongodump) -or !(Test-Path $mongorestore)) {
  throw "MongoDB Database Tools are not installed in '$toolsBin'."
}

if (!(Test-Path $DumpRoot)) {
  New-Item -ItemType Directory -Path $DumpRoot | Out-Null
}

Write-Host "[staging-refresh] dumping '$SourceDb'..."
& $mongodump --uri="$MongoUri" --db="$SourceDb" --out="$DumpRoot" | Out-Host

Write-Host "[staging-refresh] restoring '$SourceDb' -> '$TargetDb' with --drop..."
& $mongorestore --uri="$MongoUri" --nsFrom="$SourceDb.*" --nsTo="$TargetDb.*" --drop "$DumpRoot" | Out-Host

Write-Host "[staging-refresh] validating copy..."
$env:MONGO_URI = $MongoUri
node ".\scripts\compare-dbs.js" "$SourceDb" "$TargetDb"
if ($LASTEXITCODE -ne 0) {
  throw "Database comparison failed with exit code $LASTEXITCODE."
}

Write-Host "[staging-refresh] completed successfully."
