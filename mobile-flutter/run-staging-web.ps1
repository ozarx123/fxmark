param(
  [string]$ApiBaseUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"

flutter pub get
flutter run -d web-server --web-port 8082 --web-hostname 0.0.0.0 --dart-define=API_BASE_URL=$ApiBaseUrl --dart-define=APP_ENV=staging
