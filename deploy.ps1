# deploy.ps1 – sekwencja wdrożenia EPIR
# Uruchom z głównego katalogu projektu: .\deploy.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== EPIR Deploy ===" -ForegroundColor Cyan

# 1. npm ci (workspaces)
Write-Host "`n[1/6] npm ci..." -ForegroundColor Yellow
Set-Location $root
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

# 2. Deploy workers (rag → analytics → bigquery-batch → chat; chat wymaga rag + analytics)
Write-Host "`n[2/7] Deploy epir-rag-worker..." -ForegroundColor Yellow
Set-Location "$root\workers\rag-worker"
wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "rag deploy failed" }

Write-Host "`n[3/7] Deploy epir-analityc-worker..." -ForegroundColor Yellow
Set-Location "$root\workers\analytics"
wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "analytics deploy failed" }

Write-Host "`n[4/7] Deploy epir-bigquery-batch..." -ForegroundColor Yellow
Set-Location "$root\workers\bigquery-batch"
wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "bigquery-batch deploy failed" }

Write-Host "`n[5/7] Deploy epir-art-jewellery-worker (chat)..." -ForegroundColor Yellow
Set-Location "$root\workers\chat"
wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "chat deploy failed" }

# 4. Shopify app – build i deploy (extensions, app proxy)
Write-Host "`n[6/7] shopify app build (repo @shopify/cli via npm script)..." -ForegroundColor Yellow
Set-Location $root
npm run shopify:app:build
if ($LASTEXITCODE -ne 0) { throw "shopify app build failed" }

Write-Host "`n[7/7] shopify app deploy..." -ForegroundColor Yellow
npm run shopify:app:deploy
if ($LASTEXITCODE -ne 0) { throw "shopify app deploy failed" }

Write-Host "`n=== Deploy zakonczony ===" -ForegroundColor Green
Write-Host "Sprawdz: https://asystent.epirbizuteria.pl/chat" -ForegroundColor Gray
