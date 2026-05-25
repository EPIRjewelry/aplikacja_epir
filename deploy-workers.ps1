# deploy-workers.ps1 — tylko Cloudflare Workers (bez npm ci, bez Shopify).
# Uruchom z katalogu repo: .\deploy-workers.ps1
# Kolejność: rag → analytics → bigquery-batch → analyst → marketing-ingest → store-steward → chat.
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

Deploy-Worker "workers\rag-worker"         "[1/7] epir-rag-worker"
Deploy-Worker "workers\analytics"          "[2/7] epir-analityc-worker"
Deploy-Worker "workers\bigquery-batch"     "[3/7] epir-bigquery-batch"
Deploy-Worker "workers\analyst-worker"     "[4/7] epir-analyst-worker"
Deploy-Worker "workers\marketing-ingest"   "[5/7] epir-marketing-ingest"
Deploy-Worker "workers\store-steward"      "[6/7] epir-store-steward"
Deploy-Worker "workers\chat"               "[7/7] epir-art-jewellery-worker (chat)"

Set-Location $root
Write-Host "`n=== Workers deploy zakonczony ===" -ForegroundColor Green
