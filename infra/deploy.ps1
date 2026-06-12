# Deploy the app: build -> push to ECR -> refresh the EC2 container.
# Prereq: terraform apply done (EC2 running); docker + aws CLI installed; run migrate.ps1 first on a fresh RDS.
# Usage (from infra/):  powershell -ExecutionPolicy Bypass -File deploy.ps1   (optional: -Tag v1)

param([string]$Tag = "latest")

$ErrorActionPreference = "Stop"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$Region = "ap-northeast-1"
$Project = "mono-log"
$RepoRoot = Split-Path $PSScriptRoot -Parent  # repo root holds the Dockerfile

# Build ECR registry / repo URL from the account id.
$Acct = (& $aws sts get-caller-identity --query Account --output text)
$Registry = "$Acct.dkr.ecr.$Region.amazonaws.com"
$Repo = "$Registry/$Project-app"

Write-Host "== ECR login =="
# PowerShell の stdin パイプはトークンを壊して 400 になることがあるため --password で渡す
$ecrPw = (& $aws ecr get-login-password --region $Region)
docker login --username AWS --password $ecrPw $Registry

Write-Host "== build & push (linux/arm64) =="
# EC2 is t4g (ARM), so target linux/arm64 explicitly (slow via QEMU emulation on x64).
# --provenance=false: skip the in-toto attestation manifest so :latest stays a single
# plain image manifest; the EC2 Docker (no containerd image store) cannot pull the
# OCI index buildx emits by default (unsupported media type application/vnd.in-toto+json).
docker buildx build --platform linux/arm64 --provenance=false -t "${Repo}:$Tag" --push $RepoRoot

Write-Host "== find EC2 instance =="
$Instance = (& $aws ec2 describe-instances --region $Region `
    --filters "Name=tag:Project,Values=$Project" "Name=instance-state-name,Values=running" `
    --query "Reservations[0].Instances[0].InstanceId" --output text)
if (-not $Instance -or $Instance -eq "None") {
  throw "running EC2 not found (check terraform apply)"
}
Write-Host "instance: $Instance"

Write-Host "== refresh container via SSM (pull + re-run) =="
$Cmd = (& $aws ssm send-command --region $Region --instance-ids $Instance `
    --document-name "AWS-RunShellScript" `
    --parameters 'commands=["/usr/local/bin/mono-log-run.sh"]' `
    --query "Command.CommandId" --output text)
Write-Host "SSM command id: $Cmd"

& $aws ssm wait command-executed --region $Region --command-id $Cmd --instance-id $Instance
& $aws ssm get-command-invocation --region $Region --command-id $Cmd --instance-id $Instance `
    --query "{Status:Status, Stdout:StandardOutputContent, Stderr:StandardErrorContent}" --output json

Write-Host "== done. Open the CloudFront domain below =="
& $aws cloudfront list-distributions `
    --query "DistributionList.Items[?Comment=='$Project app distribution'].DomainName" --output text
