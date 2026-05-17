$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $projectRoot "backend-python")

alembic upgrade head
python scripts/bootstrap_super_admin.py
Write-Host "Super admin bootstrap completed successfully."
