# Smoke EDOG flow-health przez proxy workera czatu (RPC → bigquery-batch).
# Użycie:
#   $env:EPIR_CHAT_WORKER_ORIGIN = 'https://asystent.epirbizuteria.pl'
#   # Opcjonalnie legacy (gdy brak Cloudflare Access w curl):
#   $env:EPIR_OPERATOR_PANEL_SECRET = '...'
#   .\scripts\smoke-flow-health.ps1

$ErrorActionPreference = 'Stop'
$origin = $env:EPIR_CHAT_WORKER_ORIGIN
if (-not $origin) { $origin = 'https://asystent.epirbizuteria.pl' }
$uri = ($origin.TrimEnd('/')) + '/internal/operator-studio/api/flow-health'
$headers = @{ Accept = 'application/json' }
if ($env:EPIR_OPERATOR_PANEL_SECRET) {
  $headers['X-Admin-Key'] = $env:EPIR_OPERATOR_PANEL_SECRET
}
$res = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
Write-Host ($res | ConvertTo-Json -Depth 6)
if ($res.edog_verdict -ne 'PASS') {
  Write-Error "EDOG smoke FAIL: $($res.edog_verdict)"
}
Write-Host 'EDOG smoke PASS'
