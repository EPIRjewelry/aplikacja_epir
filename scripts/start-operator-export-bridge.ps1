#Requires -Version 5.1
<#
.SYNOPSIS
  Start local Operator Studio export bridge (writes Markdown to D:\EPIR\operator-studio).

  Optional: cloudflared tunnel for remote worker access (set OPERATOR_EXPORT_ORIGIN in wrangler.toml).
#>
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$configPath = Join-Path $RepoRoot "scripts\local-operator-export\export.config.json"
if (-not (Test-Path $configPath)) {
    throw "Missing $configPath"
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$bindHost = if ($env:EXPORT_HTTP_HOST) { $env:EXPORT_HTTP_HOST } else { $config.host }
$port = if ($env:EXPORT_HTTP_PORT) { [int]$env:EXPORT_HTTP_PORT } else { [int]$config.port }
$rootDir = if ($env:OPERATOR_EXPORT_ROOT) { $env:OPERATOR_EXPORT_ROOT } else { $config.rootDir }

foreach ($sub in @("analyst", "cad", "store_ops", "creative")) {
    $p = Join-Path $rootDir $sub
    if (-not (Test-Path $p)) {
        New-Item -ItemType Directory -Path $p -Force | Out-Null
        Write-Host "Created $p"
    }
}

try {
    $health = Invoke-RestMethod -Uri "http://${bindHost}:${port}/health" -TimeoutSec 2
    if ($health.ok) {
        Write-Host "Export bridge already running on http://${bindHost}:${port}"
    }
} catch {
    Write-Host "Starting export bridge on http://${bindHost}:${port} (root: $rootDir)"
    Start-Process -FilePath "node" -ArgumentList "scripts\local-operator-export\server.mjs" -WorkingDirectory $RepoRoot -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

try {
    $health = Invoke-RestMethod -Uri "http://${bindHost}:${port}/health" -TimeoutSec 5
    Write-Host "Export health: ok=$($health.ok) root=$($health.root)"
} catch {
    throw "Export bridge did not start on port $port"
}

$tunnelName = $env:OPERATOR_EXPORT_CLOUDFLARED_TUNNEL
if (-not $tunnelName) { $tunnelName = "epir-blender-bridge" }
$publicHost = $env:OPERATOR_EXPORT_HOSTNAME
if (-not $publicHost) { $publicHost = "operator-export.epirbizuteria.pl" }

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cf) {
    Write-Host "Optional: expose via tunnel $tunnelName -> http://${bindHost}:${port}"
    Write-Host "  cloudflared tunnel route dns $tunnelName $publicHost"
    Write-Host "  Add ingress in %USERPROFILE%\.cloudflared\config.yml for $publicHost"
    Write-Host "  Then set OPERATOR_EXPORT_ORIGIN=https://$publicHost in workers/chat/wrangler.toml"
} else {
    Write-Warning "cloudflared not in PATH — eksport z chmury wymaga tunelu lub lokalnego dev."
}

Write-Host @"

Done. In Operator Studio: Zapisz na dysk (D:\) — role Analityk lub Blender/CAD.
Local only: worker must reach PC via OPERATOR_EXPORT_ORIGIN tunnel URL.
"@
