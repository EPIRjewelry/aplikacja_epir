# deploy-workers.ps1 — tylko Cloudflare Workers (bez npm ci, bez Shopify).
# Uruchom z katalogu repo: .\deploy-workers.ps1
# Kolejność jak w deploy.ps1: rag → analytics → bigquery-batch → marketing-ingest → chat.
# Każdy deploy: npx wrangler deploy --env="" (jawny top-level przy [env.*] w wrangler.toml).

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== EPIR Deploy (workers only) ===" -ForegroundColor Cyan

function Deploy-Worker {
    param(
        [string] $RelativePath,
        [string] $Label
    )
    Write-Host "`n$Label" -ForegroundColor Yellow
    Set-Location (Join-Path $root $RelativePath)
    # Jawny top-level (root) — zgodnie z ostrzeżeniem Wranglera przy [env.staging]/[env.production].
    npx wrangler deploy --env=""
    if ($LASTEXITCODE -ne 0) { throw "Deploy failed: $RelativePath" }
}

Deploy-Worker "workers\rag-worker"        "[1/5] epir-rag-worker"
Deploy-Worker "workers\analytics"       "[2/5] epir-analityc-worker"
Deploy-Worker "workers\bigquery-batch"  "[3/5] epir-bigquery-batch"
Deploy-Worker "workers\marketing-ingest" "[4/5] epir-marketing-ingest"
Deploy-Worker "workers\chat"            "[5/5] epir-art-jewellery-worker (chat)"

Set-Location $root
Write-Host "`n=== Workers deploy zakonczony ===" -ForegroundColor Green
