# Ustawia sekrety BigQuery z pliku JSON service account
# Użycie: .\scripts\set-bigquery-secrets-from-json.ps1 -JsonPath "C:\Users\user\Downloads\epir-xxx.json"
# LUB: skopiuj plik JSON do workers/bigquery-batch/service-account.json i uruchom bez parametru

param(
    [string]$JsonPath
)

$root = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { "D:\aplikacja_epir" }
$defaultPath = Join-Path $root "workers\bigquery-batch\service-account.json"

$path = if ($JsonPath -and (Test-Path $JsonPath)) { $JsonPath } 
        elseif (Test-Path $defaultPath) { $defaultPath }
        else {
    Write-Host "Podaj ścieżkę do pliku JSON:" -ForegroundColor Yellow
    Write-Host "  .\scripts\set-bigquery-secrets-from-json.ps1 -JsonPath `"C:\Users\user\Downloads\twoj-plik.json`"" -ForegroundColor Gray
    Write-Host ""
    Write-Host "LUB skopiuj plik do: workers\bigquery-batch\service-account.json" -ForegroundColor Gray
    exit 1
}

$json = Get-Content $path -Raw | ConvertFrom-Json

Write-Host "Ustawianie sekretów z: $path" -ForegroundColor Cyan
Write-Host "  project_id: $($json.project_id)" -ForegroundColor Gray
Write-Host "  client_email: $($json.client_email)" -ForegroundColor Gray
Write-Host ""

$workerDir = Join-Path $root "workers\bigquery-batch"
Push-Location $workerDir

try {
    # GOOGLE_PROJECT_ID
    $json.project_id | wrangler secret put GOOGLE_PROJECT_ID
    Write-Host "[OK] GOOGLE_PROJECT_ID" -ForegroundColor Green

    # GOOGLE_CLIENT_EMAIL
    $json.client_email | wrangler secret put GOOGLE_CLIENT_EMAIL
    Write-Host "[OK] GOOGLE_CLIENT_EMAIL" -ForegroundColor Green

    # GOOGLE_PRIVATE_KEY (z \n - worker zamienia na prawdziwe newline)
    $json.private_key | wrangler secret put GOOGLE_PRIVATE_KEY
    Write-Host "[OK] GOOGLE_PRIVATE_KEY" -ForegroundColor Green

    Write-Host ""
    Write-Host "Wszystkie sekrety ustawione." -ForegroundColor Green
} finally {
    Pop-Location
}
