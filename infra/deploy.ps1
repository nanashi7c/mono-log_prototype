# mono-log アプリのデプロイ（ビルド → ECR push → EC2 のコンテナ更新）。
# 前提: terraform apply 済み（EC2 が running）／docker・aws CLI 導入済み／初回は migrate.ps1 を先に実行。
# 使い方: infra/ で  powershell -File deploy.ps1   （タグ指定可: -Tag v1）

param([string]$Tag = "latest")

$ErrorActionPreference = "Stop"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$Region = "ap-northeast-1"
$Project = "mono-log"
$RepoRoot = Split-Path $PSScriptRoot -Parent  # Dockerfile があるリポジトリ直下

# アカウントID から ECR レジストリ / リポジトリ URL を組み立てる
$Acct = (& $aws sts get-caller-identity --query Account --output text)
$Registry = "$Acct.dkr.ecr.$Region.amazonaws.com"
$Repo = "$Registry/$Project-app"

Write-Host "== ECR ログイン ==" -ForegroundColor Cyan
& $aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $Registry

Write-Host "== ビルド & push (linux/arm64) ==" -ForegroundColor Cyan
# EC2 は t4g(ARM) なので linux/arm64 を明示（Windows/x64 上では QEMU エミュレートで遅い）
docker buildx build --platform linux/arm64 -t "${Repo}:$Tag" --push $RepoRoot

Write-Host "== EC2 インスタンスを特定 ==" -ForegroundColor Cyan
$Instance = (& $aws ec2 describe-instances --region $Region `
    --filters "Name=tag:Project,Values=$Project" "Name=instance-state-name,Values=running" `
    --query "Reservations[0].Instances[0].InstanceId" --output text)
if (-not $Instance -or $Instance -eq "None") {
  throw "running な EC2 が見つかりません（terraform apply 済みか確認してください）"
}
Write-Host "instance: $Instance"

Write-Host "== SSM 経由でコンテナを更新（pull → 再 run） ==" -ForegroundColor Cyan
$Cmd = (& $aws ssm send-command --region $Region --instance-ids $Instance `
    --document-name "AWS-RunShellScript" `
    --parameters 'commands=["/usr/local/bin/mono-log-run.sh"]' `
    --query "Command.CommandId" --output text)
Write-Host "SSM command id: $Cmd"

& $aws ssm wait command-executed --region $Region --command-id $Cmd --instance-id $Instance
& $aws ssm get-command-invocation --region $Region --command-id $Cmd --instance-id $Instance `
    --query "{Status:Status, Stdout:StandardOutputContent, Stderr:StandardErrorContent}" --output json

Write-Host "== 完了。CloudFront のドメインでアクセスしてください ==" -ForegroundColor Green
& $aws cloudfront list-distributions `
    --query "DistributionList.Items[?Comment=='$Project app distribution'].DomainName" --output text
