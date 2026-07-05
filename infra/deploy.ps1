# Ksystem domain deploy (S3 + CloudFront)
# Production URL: https://ksystemapp.com/aisyougi/
param(
    [string]$Bucket = "ksystemapp-web-production",
    [string]$Prefix = "aisyougi",
    [string]$DistributionId = "E2PVD76VHGLFRI",
    [string]$Region = "ap-northeast-1"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

python (Join-Path $PSScriptRoot "ensure-utf8.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying AiSyougi to s3://$Bucket/$Prefix/ ..."

aws s3 sync $Root "s3://$Bucket/$Prefix/" `
    --delete `
    --region $Region `
    --exclude ".git/*" `
    --exclude ".github/*" `
    --exclude "infra/*" `
    --exclude ".gitignore" `
    --exclude ".gitattributes" `
    --exclude "cf-config.json" `
    --exclude "deploy-wf.*" `
    --exclude "*.zip" `
    --exclude "sticker-fn.js" `
    --exclude "aisyougi-fn-live.js" `
    --exclude "kakeibo-fn.zip" `
    --exclude "out.zip" `
    --exclude "backend/*" `
    --exclude ".venv/*" `
    --exclude "docker-compose.yml" `
    --exclude ".dockerignore"

$invalidation = aws cloudfront create-invalidation `
    --distribution-id $DistributionId `
    --paths "/$Prefix/*" `
    --query "Invalidation.Id" `
    --output text

Write-Host "Done. Invalidation: $invalidation"
Write-Host "URL: https://ksystemapp.com/$Prefix/"
