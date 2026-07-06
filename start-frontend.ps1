# Local frontend dev server (must run from project root)
param(
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

if (-not (Test-Path (Join-Path $Root "index.html"))) {
    Write-Error "index.html not found. Run this script from the AiSyougi project root."
}

Set-Location $Root
Write-Host "Serving AiSyougi from $Root"
$url = "http://localhost:$Port/"
Write-Host "Open: $url"
Write-Host "Stop: Ctrl+C"
Start-Process $url
python -m http.server $Port
