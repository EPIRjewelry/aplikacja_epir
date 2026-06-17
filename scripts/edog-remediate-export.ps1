# EDOG — wymuszenie eksportu D1→Pipelines w pętli (remediacja backlogu)
# Użycie:
#   $env:EPIR_OPERATOR_PANEL_SECRET = '...'
#   .\scripts\edog-remediate-export.ps1 -MaxRuns 12 -TargetPending 1000

param(
  [int]$MaxRuns = 12,
  [int]$TargetPending = 1000,
  [int]$SleepSeconds = 3
)

$ErrorActionPreference = 'Stop'
$origin = $env:EPIR_CHAT_WORKER_ORIGIN
if (-not $origin) { $origin = 'https://asystent.epirbizuteria.pl' }
if (-not $env:EPIR_OPERATOR_PANEL_SECRET) {
  Write-Error 'Ustaw EPIR_OPERATOR_PANEL_SECRET'
}

$healthUri = ($origin.TrimEnd('/')) + '/internal/operator-studio/api/flow-health'
$exportUri = ($origin.TrimEnd('/')) + '/internal/operator-studio/api/trigger-warehouse-export'
$headers = @{
  Accept = 'application/json'
  'X-Admin-Key' = $env:EPIR_OPERATOR_PANEL_SECRET
}

function Get-Pending {
  $h = Invoke-RestMethod -Uri $healthUri -Headers $headers -Method Get
  return @{ pending = [int]$h.pending_pixel_events; verdict = $h.edog_verdict; health = $h }
}

Write-Host "=== EDOG remediate export (max $MaxRuns runs, target pending < $TargetPending) ===" -ForegroundColor Cyan

$start = Get-Pending
Write-Host "Start: pending=$($start.pending) verdict=$($start.verdict)"

for ($i = 1; $i -le $MaxRuns; $i++) {
  Write-Host "--- Run $i/$MaxRuns POST trigger-warehouse-export ---"
  try {
    $out = Invoke-RestMethod -Uri $exportUri -Headers $headers -Method Post
  } catch {
    Write-Error "trigger failed: $($_.Exception.Message)"
  }
  $s = $out.summary
  if ($s) {
    Write-Host "  pixelExported=$($s.pixelExported) pending_after=$($s.pending_pixel_after) partial=$($s.partial)"
    if ($s.pipeline_error) { Write-Host "  pipeline_error: $($s.pipeline_error)" -ForegroundColor Red }
  } else {
    Write-Host '  summary=null (brak URL pipeline lub worker error)' -ForegroundColor Yellow
  }

  Start-Sleep -Seconds $SleepSeconds
  $cur = Get-Pending
  Write-Host "  pending=$($cur.pending) verdict=$($cur.verdict)"
  if ($cur.pending -ge 0 -and $cur.pending -lt $TargetPending -and $cur.verdict -eq 'PASS') {
    Write-Host 'Remediate: PASS' -ForegroundColor Green
    exit 0
  }
  if ($cur.pending -ge 0 -and $cur.pending -lt $TargetPending) {
    Write-Host "Backlog <$TargetPending ale werdykt=$($cur.verdict) — sprawdź batch_exports.updated_at" -ForegroundColor Yellow
    exit 0
  }
}

Write-Host "Remediate: incomplete after $MaxRuns runs" -ForegroundColor Red
exit 1
