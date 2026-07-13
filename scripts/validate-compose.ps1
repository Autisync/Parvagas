Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$required = @(
  "docker-compose.yml",
  "docker-compose.dev.yml",
  "docker-compose.dev.portainer.yml",
  "docker-compose.prod.portainer.yml"
)

foreach ($f in $required) {
  if (-not (Test-Path $f)) { throw "[FAIL] Missing required file: $f" }
}

if (-not (Test-Path "reactive-resume/Dockerfile") -or -not (Test-Path "reactive-resume/package.json") -or -not (Test-Path "reactive-resume/pnpm-lock.yaml")) {
  throw "[FAIL] Reactive Resume source is missing. Copy the full CV Builder repository contents directly into ./reactive-resume before running the local stack."
}

$retired = @("docker-compose-updated.yml", "docker-compose.prod.yml", "docker-compose.portainer.yml")
foreach ($f in $retired) {
  if (Test-Path $f) { throw "[FAIL] Retired compose file still present at repo root: $f" }
}

if (-not $env:TRAEFIK_NETWORK) {
  Write-Host "[WARN] TRAEFIK_NETWORK is not set; default 'proxy' will be used in Portainer files."
}

Write-Host "[CHECK] docker-compose.yml"
docker compose -f docker-compose.yml config | Out-File -Encoding utf8 .tmp-compose-base.out
if ($LASTEXITCODE -ne 0) { throw "[FAIL] docker-compose.yml config failed" }

Write-Host "[CHECK] docker-compose.yml + docker-compose.dev.yml"
docker compose -f docker-compose.yml -f docker-compose.dev.yml config | Out-File -Encoding utf8 .tmp-compose-local.out
if ($LASTEXITCODE -ne 0) { throw "[FAIL] docker-compose.yml + docker-compose.dev.yml config failed" }

Write-Host "[CHECK] docker-compose.dev.portainer.yml"
docker compose --env-file .env.dev.portainer.example -f docker-compose.dev.portainer.yml config | Out-File -Encoding utf8 .tmp-compose-dev-portainer.out
if ($LASTEXITCODE -ne 0) { throw "[FAIL] docker-compose.dev.portainer.yml config failed" }

Write-Host "[CHECK] docker-compose.prod.portainer.yml"
docker compose --env-file .env.prod.portainer.example -f docker-compose.prod.portainer.yml config | Out-File -Encoding utf8 .tmp-compose-prod-portainer.out
if ($LASTEXITCODE -ne 0) { throw "[FAIL] docker-compose.prod.portainer.yml config failed" }

$portainerBuildHits = Select-String -Path docker-compose.dev.portainer.yml,docker-compose.prod.portainer.yml -Pattern '^\s*build:'
if ($portainerBuildHits) {
  throw "[FAIL] Portainer compose files must be image-only. Remove all build directives."
}

# Duplicate exposed host ports
$ports = Get-ChildItem .tmp-compose-*.out | ForEach-Object {
  $m = Select-String -Path $_.FullName -Pattern 'published:\s*"?([0-9]+)"?' -AllMatches
  foreach ($line in $m) {
    foreach ($match in $line.Matches) {
      $match.Groups[1].Value
    }
  }
}
$dups = $ports | Group-Object | Where-Object { $_.Count -gt 1 }
if ($dups) {
  throw "[FAIL] Duplicate exposed host ports detected: $($dups.Name -join ', ')"
}

# Duplicate Traefik router names between dev/prod
$devRouters = (Select-String -Path docker-compose.dev.portainer.yml -Pattern 'traefik\.http\.routers\.([^.]+)\.' -AllMatches).Matches | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$prodRouters = (Select-String -Path docker-compose.prod.portainer.yml -Pattern 'traefik\.http\.routers\.([^.]+)\.' -AllMatches).Matches | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$overlap = Compare-Object -ReferenceObject $devRouters -DifferenceObject $prodRouters -IncludeEqual -ExcludeDifferent | Select-Object -ExpandProperty InputObject -Unique
if ($overlap) {
  throw "[FAIL] Duplicate Traefik router names found in dev/prod: $($overlap -join ', ')"
}

# Obsolete vars
$obsolete = 'STORAGE_PROVIDER|STORAGE_ENDPOINT|ACCESS_TOKEN_SECRET|REFRESH_TOKEN_SECRET|BETTER_AUTH_SECRET|NEXT_PUBLIC_CV_BUILDER_URL'
$scanFiles = @(
  'docker-compose.yml',
  'docker-compose.dev.yml',
  'docker-compose.dev.portainer.yml',
  'docker-compose.prod.portainer.yml',
  '.env.example',
  '.env.local.example',
  '.env.dev.portainer.example',
  '.env.prod.portainer.example'
)
$hits = Select-String -Path $scanFiles -Pattern $obsolete
if ($hits) {
  throw "[FAIL] Obsolete CV/storage/auth variables detected."
}

# Dev/prod isolation checks
if (Select-String -Path docker-compose.prod.portainer.yml -Pattern 'parvagas_dev_postgres_data') { throw "[FAIL] Prod references dev volumes." }
if (Select-String -Path docker-compose.dev.portainer.yml -Pattern 'parvagas_prod_postgres_data') { throw "[FAIL] Dev references prod volumes." }
if (Select-String -Path docker-compose.prod.portainer.yml -Pattern 'parvagas_cv_builder_dev') { throw "[FAIL] Prod references dev DB." }
if (Select-String -Path docker-compose.prod.portainer.yml -Pattern 'reactive-resume-dev') { throw "[FAIL] Prod references dev bucket." }
if (Select-String -Path docker-compose.dev.portainer.yml -Pattern 'CV_BUILDER_S3_BUCKET:-reactive-resume\}') { throw "[FAIL] Dev references prod bucket." }

# Nested interpolation patterns (env examples only)
$envScanFiles = @(
  '.env.example',
  '.env.local.example',
  '.env.dev.portainer.example',
  '.env.prod.portainer.example'
)
if (Select-String -Path $envScanFiles -Pattern '\$\{[^}]*\$\{') {
  throw "[FAIL] Nested variable interpolation detected."
}

Write-Host "[PASS] Compose validations completed."
