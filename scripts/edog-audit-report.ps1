# EDOG — raport audytu przepływu danych (read-only + narracja PL)
# Użycie:
#   $env:EPIR_CHAT_WORKER_ORIGIN = 'https://asystent.epirbizuteria.pl'
#   $env:EPIR_OPERATOR_PANEL_SECRET = '...'
#   .\scripts\edog-audit-report.ps1
# Exit 0 = PASS, 1 = FAIL/DEGRADED

$ErrorActionPreference = 'Stop'
$origin = $env:EPIR_CHAT_WORKER_ORIGIN
if (-not $origin) { $origin = 'https://asystent.epirbizuteria.pl' }
$uri = ($origin.TrimEnd('/')) + '/internal/operator-studio/api/flow-health'
$headers = @{ Accept = 'application/json' }
if ($env:EPIR_OPERATOR_PANEL_SECRET) {
  $headers['X-Admin-Key'] = $env:EPIR_OPERATOR_PANEL_SECRET
}

Write-Host "=== EDOG audit ===" -ForegroundColor Cyan
Write-Host "GET $uri"

try {
  $res = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
} catch {
  Write-Error "flow-health HTTP failed: $($_.Exception.Message)"
}

$verdict = $res.edog_verdict
Write-Host ""
Write-Host "Werdykt: $verdict" -ForegroundColor $(if ($verdict -eq 'PASS') { 'Green' } else { 'Red' })
Write-Host "Sprawdzono: $($res.checked_at)"
Write-Host ""

if ($res.narrative_markdown) {
  Write-Host $res.narrative_markdown
} else {
  Write-Host "## Powody (brak narrative_markdown — zdeployuj najnowszy epir-bigquery-batch)"
  foreach ($r in $res.reasons) { Write-Host " - $r" }
  Write-Host ""
  Write-Host "pending_pixel_events: $($res.pending_pixel_events)"
  Write-Host "d1_pixel_events_24h: $($res.d1_pixel_events_24h)"
  Write-Host "pipeline_pixel_configured: $($res.pipeline_pixel_configured)"
  if ($res.batch_exports) {
    Write-Host "batch_exports.updated_at: $($res.batch_exports.updated_at)"
    Write-Host "batch_exports.last_pixel_export_at: $($res.batch_exports.last_pixel_export_at)"
  }
}

Write-Host ""
Write-Host "=== JSON (skrót) ===" -ForegroundColor Cyan
$res | ConvertTo-Json -Depth 6

if ($verdict -ne 'PASS') {
  Write-Host ""
  Write-Host "EDOG audit: FAIL (werdykt=$verdict)" -ForegroundColor Red
  Write-Host "Remediacja: .\scripts\edog-remediate-export.ps1" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host 'EDOG audit: PASS' -ForegroundColor Green
exit 0
