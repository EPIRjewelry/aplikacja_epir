# deploy-workers.ps1 — tylko Cloudflare Workers (bez npm ci, bez Shopify).
# Uruchom z katalogu repo: .\deploy-workers.ps1
# Kolejność: rag → analytics → bigquery-batch → store-steward → analyst → marketing-ingest → dynamic-landing-liquid → chat.
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
    if ($LASTEXITCODE -ne 0 -and $env:CLOUDFLARE_API_TOKEN) {
        Write-Host "  Retry bez CLOUDFLARE_API_TOKEN (OAuth; token bez KV Write blokuje deploy)..." -ForegroundColor DarkYellow
        $savedToken = $env:CLOUDFLARE_API_TOKEN
        $env:CLOUDFLARE_API_TOKEN = $null
        npx wrangler deploy --env=""
        $env:CLOUDFLARE_API_TOKEN = $savedToken
    }
    if ($LASTEXITCODE -ne 0) { throw "Deploy failed: $RelativePath" }
}

Deploy-Worker "workers\rag-worker"         "[1/8] epir-rag-worker"
Deploy-Worker "workers\analytics"          "[2/8] epir-analityc-worker"
Deploy-Worker "workers\bigquery-batch"     "[3/8] epir-bigquery-batch"
Deploy-Worker "workers\store-steward"      "[4/8] epir-store-steward"
Deploy-Worker "workers\analyst-worker"     "[5/8] epir-analyst-worker"
Deploy-Worker "workers\marketing-ingest"   "[6/8] epir-marketing-ingest"
Deploy-Worker "workers\dynamic-landing-liquid" "[7/8] epir-dynamic-landing-liquid"
Deploy-Worker "workers\chat"               "[8/8] epir-art-jewellery-worker (chat)"

Set-Location $root
Write-Host "`n=== Workers deploy zakonczony ===" -ForegroundColor Green
