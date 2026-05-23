# Smoke GET /internal/flow-health (EDOG) na epir-bigquery-batch.
# Użycie:
#   $env:DATA_GUARDIAN_OPS_KEY = '...'
#   $env:EPIR_BATCH_WORKER_ORIGIN = 'https://epir-bigquery-batch.<account>.workers.dev'
#   .\scripts\smoke-flow-health.ps1

$ErrorActionPreference = 'Stop'
$key = $env:DATA_GUARDIAN_OPS_KEY
$origin = $env:EPIR_BATCH_WORKER_ORIGIN
if (-not $key -or -not $origin) {
  Write-Error 'Ustaw DATA_GUARDIAN_OPS_KEY i EPIR_BATCH_WORKER_ORIGIN'
}
$uri = ($origin.TrimEnd('/')) + '/internal/flow-health'
$headers = @{ Authorization = "Bearer $key" }
$res = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
Write-Host ($res | ConvertTo-Json -Depth 6)
if ($res.edog_verdict -ne 'PASS') {
  Write-Error "EDOG smoke FAIL: $($res.edog_verdict)"
}
Write-Host 'EDOG smoke PASS'
