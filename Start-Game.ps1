param([ValidateRange(1024, 65535)][int]$Port = 8765)

$ErrorActionPreference = 'Stop'
$gameRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$previewUrl = "http://127.0.0.1:$Port/"

function Test-GamePreview {
    try {
        $response = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content -match '<title>Starfighter: Last Signal</title>'
    } catch {
        return $false
    }
}

if (Test-GamePreview) {
    Write-Output "Starfighter is ready: $previewUrl"
    exit 0
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    throw "Port $Port is occupied by another service. Use -Port with a free port."
}

$python = (Get-Command python.exe -ErrorAction Stop).Source
if ($python -like '*\WindowsApps\*') {
    throw 'A working Python installation is needed to start the preview.'
}

$logDirectory = Join-Path $gameRoot 'artifacts'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$arguments = @('-u', '-m', 'http.server', "$Port", '--bind', '127.0.0.1', '--directory', ('"' + $gameRoot + '"'))
$server = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $gameRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'preview-server.log') -RedirectStandardError (Join-Path $logDirectory 'preview-server-error.log')

$deadline = (Get-Date).AddSeconds(12)
do {
    if (Test-GamePreview) {
        Set-Content -LiteralPath (Join-Path $logDirectory 'preview-server.pid') -Value $server.Id
        Write-Output "Starfighter is ready: $previewUrl (background server $($server.Id))"
        exit 0
    }
    $server.Refresh()
    if ($server.HasExited) {
        throw "The preview server exited. See artifacts\preview-server-error.log."
    }
    Start-Sleep -Milliseconds 200
} while ((Get-Date) -lt $deadline)

throw 'The preview server did not become ready. See artifacts\preview-server-error.log.'
