[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateSet("prod", "dev")]
    [string]$Environment = "prod",

    [string]$Registry = "ghcr.io",
    [string]$Owner = "heliotheanalyst",
    [string]$Tag,

    [switch]$Push
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Tag)) {
    $Tag = $Environment
}

$Registry = $Registry.ToLowerInvariant()
$Owner = $Owner.ToLowerInvariant()

function Invoke-Docker {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Description,

        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )

    $display = "docker " + ($Args -join " ")
    Write-Host "`n[STEP] $Description"
    Write-Host "[CMD ] $display"

    if ($PSCmdlet.ShouldProcess($Description, $display)) {
        & docker @Args
        if ($LASTEXITCODE -ne 0) {
            throw "Docker command failed: $display"
        }
    }
}

try {
    $null = & docker --version
} catch {
    throw "Docker is not installed or not available in PATH."
}

$apiImage = "$Registry/$Owner/parvagas-backend-api:$Tag"
$wsImage = "$Registry/$Owner/parvagas-backend-ws:$Tag"
$cvImage = "$Registry/$Owner/parvagas-cv-builder:$Tag"
$cvMigrateImage = "$Registry/$Owner/parvagas-cv-builder-migrate:$Tag"

Write-Host "Environment: $Environment"
Write-Host "Registry   : $Registry"
Write-Host "Owner      : $Owner"
Write-Host "Tag        : $Tag"
Write-Host "Push       : $Push"

Invoke-Docker -Description "Build backend API image (api-service target)" -Args @(
    "build",
    "-f", "backend-python/Dockerfile",
    "--target", "api-service",
    "-t", $apiImage,
    "backend-python"
)

Invoke-Docker -Description "Build backend WebSocket image (websocket-service target)" -Args @(
    "build",
    "-f", "backend-python/Dockerfile",
    "--target", "websocket-service",
    "-t", $wsImage,
    "backend-python"
)

Invoke-Docker -Description "Build CV Builder runtime image" -Args @(
    "build",
    "-f", "reactive-resume/Dockerfile",
    "-t", $cvImage,
    "reactive-resume"
)

Invoke-Docker -Description "Build CV Builder migrate image (builder target)" -Args @(
    "build",
    "-f", "reactive-resume/Dockerfile",
    "--target", "builder",
    "-t", $cvMigrateImage,
    "reactive-resume"
)

if ($Push) {
    Invoke-Docker -Description "Push backend API image" -Args @("push", $apiImage)
    Invoke-Docker -Description "Push backend WebSocket image" -Args @("push", $wsImage)
    Invoke-Docker -Description "Push CV Builder image" -Args @("push", $cvImage)
    Invoke-Docker -Description "Push CV Builder migrate image" -Args @("push", $cvMigrateImage)
}

Write-Host "`nImages generated:"
Write-Host "- BACKEND_API_IMAGE=$apiImage"
Write-Host "- BACKEND_WS_IMAGE=$wsImage"
Write-Host "- CV_BUILDER_IMAGE=$cvImage"
Write-Host "- CV_BUILDER_MIGRATE_IMAGE=$cvMigrateImage"

if (-not $Push) {
    Write-Host "`nTip: re-run with -Push to upload images to your registry."
}
