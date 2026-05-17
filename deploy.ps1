# deploy.ps1 – sekwencja wdrożenia EPIR
# Uruchom z głównego katalogu projektu: .\deploy.ps1
# Tylko Workers (bez npm ci / Shopify): .\deploy-workers.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== EPIR Deploy ===" -ForegroundColor Cyan

# 1. npm ci (workspaces)
Write-Host "`n[1/8] npm ci..." -ForegroundColor Yellow
Set-Location $root
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

# 2. Deploy workers (rag → analytics → bigquery-batch → marketing-ingest → chat; chat wymaga rag + analytics).
#    wrangler deploy --env="" = jawny top-level przy [env.*] w wrangler.toml (zalecenie CLI).
Write-Host "`n[2/8] Deploy epir-rag-worker..." -ForegroundColor Yellow
Set-Location "$root\workers\rag-worker"
wrangler deploy --env=""
if ($LASTEXITCODE -ne 0) { throw "rag deploy failed" }

Write-Host "`n[3/8] Deploy epir-analityc-worker..." -ForegroundColor Yellow
Set-Location "$root\workers\analytics"
wrangler deploy --env=""
if ($LASTEXITCODE -ne 0) { throw "analytics deploy failed" }

Write-Host "`n[4/8] Deploy epir-bigquery-batch..." -ForegroundColor Yellow
Set-Location "$root\workers\bigquery-batch"
wrangler deploy --env=""
if ($LASTEXITCODE -ne 0) { throw "bigquery-batch deploy failed" }

Write-Host "`n[5/8] Deploy epir-marketing-ingest..." -ForegroundColor Yellow
Set-Location "$root\workers\marketing-ingest"
wrangler deploy --env=""
if ($LASTEXITCODE -ne 0) { throw "marketing-ingest deploy failed" }

Write-Host "`n[6/8] Deploy epir-art-jewellery-worker (chat)..." -ForegroundColor Yellow
Set-Location "$root\workers\chat"
wrangler deploy --env=""
if ($LASTEXITCODE -ne 0) { throw "chat deploy failed" }

# 4. Shopify app – build i deploy (extensions, app proxy)
Write-Host "`n[7/8] shopify app build (repo @shopify/cli via npm script)..." -ForegroundColor Yellow
Set-Location $root
npm run shopify:app:build
if ($LASTEXITCODE -ne 0) { throw "shopify app build failed" }

Write-Host "`n[8/8] shopify app deploy..." -ForegroundColor Yellow
npm run shopify:app:deploy
if ($LASTEXITCODE -ne 0) { throw "shopify app deploy failed" }

Write-Host "`n=== Deploy zakonczony ===" -ForegroundColor Green
Write-Host "Sprawdz: https://asystent.epirbizuteria.pl/chat" -ForegroundColor Gray
