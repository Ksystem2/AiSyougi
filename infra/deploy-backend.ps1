# Build + push AISyougi API image, update ECS via Terraform, configure CloudFront
param(
    [switch]$SkipDockerBuild,
    [switch]$SkipTerraform,
    [switch]$SkipCloudFront,
    [switch]$SkipFrontend,
    [string]$ImageTag = ""
)

$ErrorActionPreference = "Stop"
$Region = "ap-northeast-1"
$Account = "345362761619"
$Repo = "${Account}.dkr.ecr.${Region}.amazonaws.com/aisyougi-api"
$Root = Split-Path -Parent $PSScriptRoot
$TfDir = Join-Path $PSScriptRoot "terraform-aisyougi-api"

function Ensure-Utf8PythonFiles {
    python -c @"
from pathlib import Path
root = Path(r'$Root')
for p in root.rglob('*'):
    if p.suffix.lower() not in {'.py', '.tf', '.tfvars', '.yml', '.yaml', '.ps1'}:
        continue
    if not p.is_file():
        continue
    raw = p.read_bytes()
    if len(raw) >= 2 and raw[1] == 0 and raw[0] < 128:
        p.write_text(raw.decode('utf-16-le'), encoding='utf-8', newline='\n')
"@
}

Ensure-Utf8PythonFiles

if (-not $ImageTag) {
    $ImageTag = (git -C $Root rev-parse --short HEAD 2>$null)
    if (-not $ImageTag) { $ImageTag = "local-$(Get-Date -Format 'yyyyMMddHHmm')" }
}

$ImageUri = "${Repo}:$ImageTag"

if (-not $SkipDockerBuild) {
    Write-Host "=== 1/4 Docker build + ECR push ($ImageTag) ===" -ForegroundColor Cyan
    aws ecr describe-repositories --repository-names aisyougi-api --region $Region 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ECR repo missing — run terraform apply first or create manually"
    }

    aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin "${Account}.dkr.ecr.${Region}.amazonaws.com"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    docker build -f (Join-Path $Root "backend/Dockerfile") -t $ImageUri -t "${Repo}:latest" $Root
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    docker push $ImageUri
    docker push "${Repo}:latest"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    Write-Host "Skipped Docker build"
}

if (-not $SkipTerraform) {
    Write-Host "=== 2/4 Terraform apply ===" -ForegroundColor Cyan
    $tfvars = Join-Path $TfDir "terraform.tfvars"
    $content = Get-Content $tfvars -Raw
    $content = $content -replace 'container_image = ".*"', "container_image = `"$ImageUri`""
    Set-Content -Path $tfvars -Value $content -Encoding utf8

    Push-Location $TfDir
    try {
        terraform init -input=false
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        terraform apply -auto-approve -input=false
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }

    Write-Host "Waiting for ECS service stable..."
    aws ecs wait services-stable `
        --cluster aisyougi-api-cluster `
        --services aisyougi-api-service `
        --region $Region
}

if (-not $SkipCloudFront) {
    Write-Host "=== 3/4 CloudFront /api/aisyougi* ===" -ForegroundColor Cyan
    python (Join-Path $PSScriptRoot "apply-cloudfront-aisyougi-api-behavior.py")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not $SkipFrontend) {
    Write-Host "=== 4/4 Frontend deploy ===" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "deploy.ps1")
}

Write-Host "Complete." -ForegroundColor Green
Write-Host "API health: https://ksystemapp.com/api/aisyougi/health"
Write-Host "Game:       https://ksystemapp.com/aisyougi/"
