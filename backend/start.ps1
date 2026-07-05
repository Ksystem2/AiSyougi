$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path "$Root\.venv\Scripts\Activate.ps1")) {
    Write-Host "Creating venv..."
    python -m venv "$Root\.venv"
}

& "$Root\.venv\Scripts\Activate.ps1"
pip install -q -r "$PSScriptRoot\requirements.txt"

if (-not $env:YANEURAOU_PATH) {
    $default = "C:\engines\YaneuraOu\YaneuraOu-Deep-NNUE.exe"
    if (Test-Path $default) {
        $env:YANEURAOU_PATH = $default
    } else {
        Write-Warning "YANEURAOU_PATH not set. Engine calls will return 503."
    }
}

Set-Location $Root
Write-Host "Starting API at http://127.0.0.1:8000"
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
