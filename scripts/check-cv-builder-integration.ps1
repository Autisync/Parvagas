Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$reactiveResumeDir = Join-Path $rootDir "reactive-resume"
$packageJsonPath = Join-Path $reactiveResumeDir "package.json"

function Pass($Message) { Write-Host "[PASS] $Message" -ForegroundColor Green }
function Warn($Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Fail($Message) { throw "[FAIL] $Message" }

if (-not (Test-Path $packageJsonPath)) { Fail "reactive-resume/package.json not found" }
Pass "Reactive Resume source detected"

$requiredEnv = @(
  "APP_URL",
  "DATABASE_URL",
  "AUTH_SECRET",
  "CV_BUILDER_DATABASE_URL",
  "RESUME_BUILDER_SECRET",
  "CV_BUILDER_ENCRYPTION_SECRET",
  "PARVAGAS_OAUTH_DISCOVERY_URL",
  "PARVAGAS_WEBHOOK_SECRET"
)

foreach ($name in $requiredEnv) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($value)) { Fail "Required environment variable is missing: $name" }
}
Pass "Required environment variables are present"

if (-not ($env:APP_URL -match '^https?://')) { Fail "APP_URL must be a valid http/https URL" }
if (-not ($env:DATABASE_URL -match '^postgres(ql)?://')) { Fail "DATABASE_URL must be a PostgreSQL URL" }
if (-not ($env:CV_BUILDER_DATABASE_URL -match '^postgres(ql)?://')) { Fail "CV_BUILDER_DATABASE_URL must be a PostgreSQL URL" }
if ([string]::IsNullOrWhiteSpace($env:AUTH_SECRET)) { Fail "AUTH_SECRET must not be empty" }
Pass "Core URL/secret validation passed"

if (-not [string]::IsNullOrWhiteSpace($env:REDIS_URL)) {
  if ($env:CV_BUILDER_ENCRYPTION_SECRET.Length -lt 32) {
    Fail "CV_BUILDER_ENCRYPTION_SECRET must be at least 32 chars"
  }
  Pass "Encryption secret length is valid for Redis-enabled setup"
}

$pkg = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
if (-not $pkg.packageManager.StartsWith("pnpm@")) { Fail "packageManager is not pnpm in reactive-resume/package.json" }

$pnpmVersion = ""
try { $pnpmVersion = (pnpm -v).Trim() } catch { }
if ([string]::IsNullOrWhiteSpace($pnpmVersion)) { Fail "pnpm is not installed" }
Pass "pnpm available (installed=$pnpmVersion, expected=$($pkg.packageManager))"

try {
  $null = Invoke-WebRequest -Uri $env:PARVAGAS_OAUTH_DISCOVERY_URL -Method Get -UseBasicParsing -TimeoutSec 15
  Pass "OAuth discovery endpoint reachable"
} catch {
  Fail "OAuth discovery endpoint is unreachable"
}

Push-Location $rootDir
try {
  docker compose config | Out-Null
  docker compose -f docker-compose.dev.yml config | Out-Null
  docker compose -f docker-compose.prod.portainer.yml config | Out-Null
  Pass "Docker Compose files resolve successfully"
} finally {
  Pop-Location
}

Write-Host "CV Builder integration preflight completed."
