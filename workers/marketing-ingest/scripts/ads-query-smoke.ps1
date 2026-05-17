#Requires -Version 5.1
<#
  Smoke: Google Ads API — top kampanie po impressjach (wczoraj UTC), jak w ads.ts.

  1) Skopiuj scripts/.ads-smoke.env.example → scripts/.ads-smoke.env i uzupełnij (plik gitignored).
     Albo ustaw te same zmienne w bieżącej sesji PowerShell.
  2) Z katalogu workers/marketing-ingest:
       .\scripts\ads-query-smoke.ps1

  Wymagane env: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
               GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID
  Opcjonalnie: GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC, bez myślników)
#>
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $ScriptDir '.ads-smoke.env'
if (Test-Path -LiteralPath $EnvFile) {
  Get-Content -LiteralPath $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $k = $line.Substring(0, $eq).Trim()
    $v = $line.Substring($eq + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    Set-Item -Path "Env:$k" -Value $v
  }
}

function Require-Env([string] $name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($v)) { throw "Brak zmiennej srodowiskowej: $name" }
}

Require-Env 'GOOGLE_ADS_CLIENT_ID'
Require-Env 'GOOGLE_ADS_CLIENT_SECRET'
Require-Env 'GOOGLE_ADS_REFRESH_TOKEN'
Require-Env 'GOOGLE_ADS_DEVELOPER_TOKEN'
Require-Env 'GOOGLE_ADS_CUSTOMER_ID'

$cid = $env:GOOGLE_ADS_CLIENT_ID.Trim()
$sec = $env:GOOGLE_ADS_CLIENT_SECRET.Trim()
$rt = $env:GOOGLE_ADS_REFRESH_TOKEN.Trim()
$devTok = $env:GOOGLE_ADS_DEVELOPER_TOKEN.Trim()
$customer = $env:GOOGLE_ADS_CUSTOMER_ID.Replace('-', '').Trim()
$loginCid = if ($env:GOOGLE_ADS_LOGIN_CUSTOMER_ID) { $env:GOOGLE_ADS_LOGIN_CUSTOMER_ID.Replace('-', '').Trim() } else { '' }

$date = ([DateTime]::UtcNow.AddDays(-1)).ToString('yyyy-MM-dd')
Write-Host "Data (wczoraj UTC): $date" -ForegroundColor Cyan
Write-Host "Customer ID (resource): $customer" -ForegroundColor Cyan
if ($loginCid) { Write-Host "login-customer-id (MCC): $loginCid" -ForegroundColor Cyan }

$tokenBody = @{
  client_id     = $cid
  client_secret = $sec
  refresh_token = $rt
  grant_type    = 'refresh_token'
}
$tokRes = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' `
  -ContentType 'application/x-www-form-urlencoded' -Body $tokenBody
if (-not $tokRes.access_token) { throw 'Brak access_token z OAuth (sprawdz refresh_token / client_secret).' }

$query = @"
SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM campaign
WHERE segments.date = '$date'
ORDER BY metrics.impressions DESC
LIMIT 25
"@.Trim()

$headers = @{
  Authorization     = "Bearer $($tokRes.access_token)"
  'developer-token' = $devTok
  'Content-Type'    = 'application/json'
}
if ($loginCid) { $headers['login-customer-id'] = $loginCid }

$bodyObj = @{ query = $query }
$uri = "https://googleads.googleapis.com/v17/customers/$customer/googleAds:search"
try {
  $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body ($bodyObj | ConvertTo-Json -Compress)
} catch {
  $err = $_.ErrorDetails.Message
  if (-not $err) { $err = $_.Exception.Message }
  throw "Google Ads API: $err"
}

$rows = @($resp.results)
if ($rows.Count -eq 0) {
  Write-Host 'Brak wierszy (0 kampanii z danymi tego dnia albo brak uprawnien / zly CID).' -ForegroundColor Yellow
  exit 0
}

Write-Host "`nTop kampanie (impressje) — $date UTC`n" -ForegroundColor Green
$rows | ForEach-Object {
  $name = $_.campaign.name
  $id = $_.campaign.id
  $imp = [int64]$_.metrics.impressions
  $clk = [int64]$_.metrics.clicks
  $cost = ([decimal]$_.metrics.costMicros) / 1000000m
  $conv = [decimal]$_.metrics.conversions
  [PSCustomObject]@{
    CampaignId = $id
    Campaign   = $name
    Impr       = $imp
    Clicks     = $clk
    Cost       = [math]::Round($cost, 2)
    Conv       = [math]::Round($conv, 2)
  }
} | Format-Table -AutoSize

Write-Host '(Cost w walucie konta reklamowego, niekoniecznie PLN.)' -ForegroundColor DarkGray
