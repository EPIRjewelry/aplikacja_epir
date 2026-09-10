#Requires -Version 5.1
<#
.SYNOPSIS
  Odbudowa lokalnego indeksu docs + opcjonalne czyszczenie dumpów token-budget.

.DESCRIPTION
  - Uruchamia agents/indexer_agent/run_agent.py → data/embeddings.json (gitignored)
  - Opcjonalnie usuwa root .tmp-* i tree_app.txt (lokalne audyty)
  - NIE usuwa workers/chat/operator-studio-dist (deploy statyków w wrangler.toml)

.PARAMETER CleanTmp
  Usuń lokalne pliki .tmp-* i tree_app.txt z roota repo.

.PARAMETER SkipIndex
  Pomiń odbudowę embeddings (tylko clean / instrukcja reload).
#>
param(
    [switch]$CleanTmp,
    [switch]$SkipIndex
)

$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')

Set-Location $Root

Write-Host "== EPIR token-budget reload ==" -ForegroundColor Cyan
Write-Host "Repo: $Root"

if ($CleanTmp) {
    $patterns = @('.tmp-*.json', '.tmp-*.html', '.tmp-live-asset.js', '.tmp-preview-url.txt', 'tree_app.txt')
    $removed = 0
    foreach ($pat in $patterns) {
        Get-ChildItem -Path $Root -Filter $pat -File -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force
            Write-Host "  removed $($_.Name)"
            $removed++
        }
    }
    if ($removed -eq 0) {
        Write-Host "  (brak plików do usunięcia)"
    }
}

if (-not $SkipIndex) {
    $indexer = Join-Path $Root 'agents\indexer_agent\run_agent.py'
    if (-not (Test-Path $indexer)) {
        throw "Indexer not found: $indexer"
    }
    Write-Host "Rebuilding data/embeddings.json ..."
    & python $indexer
    $emb = Join-Path $Root 'data\embeddings.json'
    if (Test-Path $emb) {
        $size = (Get-Item $emb).Length
        Write-Host "  OK ($size bytes)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Cursor IDE: Command Palette → Developer: Reload Window" -ForegroundColor Yellow
Write-Host "  (odświeża .cursorignore / .cursorindexingignore bez restartu całego systemu)"
Write-Host ""
Write-Host "Pliki w docs/working/ i testy: dopnij ręcznie przez @ w czacie (poza semantic index)."
