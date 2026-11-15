# Rotacja po wycieku: EPIR_OPERATOR_PANEL_SECRET + ANALYST_HTTP_BEARER (incydent 2026-11-15).
# Uruchom LOKALNIE na Windows u operatora — NIE drukuje wartości sekretów.
#
# Wymagania:
#   - Ważny dostęp Cloudflare (CLOUDFLARE_API_TOKEN w sesji LUB wrangler login)
#   - Node/npm w repo: npm install z katalogu głównego (wrangler z workspace)
#   - Katalog roboczy: root repozytorium aplikacja_epir
#
# Użycie:
#   cd d:\aplikacja_epir   # lub ścieżka do klonu
#   $env:CLOUDFLARE_API_TOKEN = '...'   # token z uprawnieniem Workers Scripts Secrets Edit
#   .\scripts\security\rotate-operator-analyst-secrets.ps1
#
# Opcjonalnie:
#   .\scripts\security\rotate-operator-analyst-secrets.ps1 -WhatIf   # tylko whoami + secret list (bez put)
#
# Po sukcesie: zrestartuj Cursor (MCP czyta ~/.cursor/mcp.secrets.env), wklej nowy klucz w Operator Studio UI,
# uzupełnij agents/store-steward/.env jeśli używasz CLI stewarda (ten sam ANALYST_HTTP_BEARER).

[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step([string]$Message) {
    Write-Host "[rotate-secrets] $Message"
}

function New-HexSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    } finally {
        $rng.Dispose()
    }
    return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

function Invoke-WranglerSecretPut {
    param(
        [Parameter(Mandatory = $true)][string]$WorkerDir,
        [Parameter(Mandatory = $true)][string]$SecretName,
        [Parameter(Mandatory = $true)][string]$SecretValue,
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )
    $cwd = Join-Path $RepoRoot $WorkerDir
    if (-not (Test-Path $cwd)) {
        throw "Brak katalogu workera: $WorkerDir"
    }
    $prevLoc = Get-Location
    try {
        Set-Location $cwd
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'npx'
        $psi.Arguments = "wrangler secret put $SecretName"
        $psi.WorkingDirectory = $cwd
        $psi.UseShellExecute = $false
        $psi.RedirectStandardInput = $true
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        $proc.StandardInput.Write($SecretValue)
        $proc.StandardInput.Close()
        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()
        if ($proc.ExitCode -ne 0) {
            throw "wrangler secret put $SecretName w $WorkerDir zakończył się kodem $($proc.ExitCode). stderr: $stderr"
        }
        if ($stdout.Trim()) {
            # Wrangler zwykle wypisuje komunikat sukcesu bez wartości sekretu — OK.
            Write-Host $stdout.TrimEnd()
        }
    } finally {
        Set-Location $prevLoc
    }
}

function Update-DotEnvKey {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Value
    )
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $lines = @()
    if (Test-Path $Path) {
        $lines = @(Get-Content -LiteralPath $Path -Encoding utf8)
    }
    $pattern = "^\s*$([regex]::Escape($Key))\s*="
    $found = $false
    $out = foreach ($line in $lines) {
        if ($line -match $pattern) {
            $found = $true
            "${Key}=${Value}"
        } else {
            $line
        }
    }
    if (-not $found) {
        $out = @($out) + "${Key}=${Value}"
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllLines($Path, $out, $utf8NoBom)
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

Write-Step "Repo: $repoRoot"
Write-Step 'Sprawdzam wrangler whoami (bez sekretów)...'

$who = & npx wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "wrangler whoami nie powiódł się. Ustaw CLOUDFLARE_API_TOKEN lub zaloguj: npx wrangler login. Output: $who"
}
Write-Host ($who | Out-String).TrimEnd()

$mcpEnvPath = Join-Path $env:USERPROFILE '.cursor\mcp.secrets.env'

$operatorTargets = @(
    @{ Dir = 'workers/chat'; Worker = 'epir-art-jewellery-worker' },
    @{ Dir = 'workers/dynamic-landing-liquid'; Worker = 'epir-dynamic-landing-liquid' }
)
$analystTargets = @(
    @{ Dir = 'workers/analyst-worker'; Worker = 'epir-analyst-worker' }
)

if ($WhatIfPreference) {
    Write-Step '-WhatIf: pomijam generację i put; lista nazw sekretów (bez wartości):'
    foreach ($t in ($operatorTargets + $analystTargets)) {
        Push-Location (Join-Path $repoRoot $t.Dir)
        try {
            $list = & npx wrangler secret list 2>&1 | Out-String
            Write-Host "--- $($t.Worker) ($($t.Dir)) ---"
            Write-Host $list.TrimEnd()
        } finally {
            Pop-Location
        }
    }
    Write-Step 'Koniec -WhatIf.'
    return
}

$newOperator = New-HexSecret
$newAnalyst = New-HexSecret

Write-Step 'Ustawiam EPIR_OPERATOR_PANEL_SECRET (ta sama wartość na obu workerach)...'
foreach ($t in $operatorTargets) {
    if ($PSCmdlet.ShouldProcess($t.Worker, 'wrangler secret put EPIR_OPERATOR_PANEL_SECRET')) {
        Invoke-WranglerSecretPut -WorkerDir $t.Dir -SecretName 'EPIR_OPERATOR_PANEL_SECRET' -SecretValue $newOperator -RepoRoot $repoRoot
        Write-Step "OK: $($t.Worker)"
    }
}

Write-Step 'Ustawiam ANALYST_HTTP_BEARER na epir-analyst-worker...'
foreach ($t in $analystTargets) {
    if ($PSCmdlet.ShouldProcess($t.Worker, 'wrangler secret put ANALYST_HTTP_BEARER')) {
        Invoke-WranglerSecretPut -WorkerDir $t.Dir -SecretName 'ANALYST_HTTP_BEARER' -SecretValue $newAnalyst -RepoRoot $repoRoot
        Write-Step "OK: $($t.Worker)"
    }
}

Write-Step "Aktualizuję $mcpEnvPath (bez wypisu wartości)..."
Update-DotEnvKey -Path $mcpEnvPath -Key 'EPIR_OPERATOR_PANEL_SECRET' -Value $newOperator
Update-DotEnvKey -Path $mcpEnvPath -Key 'ANALYST_HTTP_BEARER' -Value $newAnalyst

# Wyzeruj zmienne w bieżącej sesji PS (nie trzymaj w historii odczytu pliku)
Remove-Variable -Name newOperator, newAnalyst -ErrorAction SilentlyContinue

Write-Step 'Weryfikacja: wrangler secret list (tylko nazwy, bez wartości)...'
foreach ($t in ($operatorTargets + $analystTargets)) {
    Push-Location (Join-Path $repoRoot $t.Dir)
    try {
        $json = & npx wrangler secret list 2>&1 | Out-String
        $hasOp = $json -match 'EPIR_OPERATOR_PANEL_SECRET'
        $hasAnalyst = $json -match 'ANALYST_HTTP_BEARER'
        Write-Host "$($t.Worker): EPIR_OPERATOR_PANEL_SECRET present=$hasOp; ANALYST_HTTP_BEARER present=$hasAnalyst"
    } finally {
        Pop-Location
    }
}

Write-Step 'Gotowe. Stare wartości przestały działać po udanym secret put. Zrestartuj Cursor i zaktualizuj Operator Studio UI.'