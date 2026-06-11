# RDS への初回マイグレーション（0001_init.sql / 0002_seed.sql）＋ monolog_app パスワード設定。
# RDS は非公開のため、SQL を S3 経由で EC2 に渡し、SSM 経由で EC2 上から psql を実行する。
# 前提: terraform apply 済み（RDS/EC2 が起動）。RDS 再作成のたびに1回実行する。
# 使い方: infra/ で  powershell -File migrate.ps1

$ErrorActionPreference = "Stop"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$Region = "ap-northeast-1"
$Project = "mono-log"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$Prefix = "_deploy/migrations"

# アプリ用バケット名（EC2 がこのバケットから SQL を取得できる権限を持つ）
$Bucket = (& $aws ssm get-parameter --region $Region --name "/$Project/s3/bucket" --query Parameter.Value --output text)

Write-Host "== マイグレーション SQL を S3 にアップロード ==" -ForegroundColor Cyan
& $aws s3 cp "$RepoRoot/migrations/0001_init.sql" "s3://$Bucket/$Prefix/0001_init.sql" --region $Region
& $aws s3 cp "$RepoRoot/migrations/0002_seed.sql" "s3://$Bucket/$Prefix/0002_seed.sql" --region $Region

Write-Host "== EC2 インスタンスを特定 ==" -ForegroundColor Cyan
$Instance = (& $aws ec2 describe-instances --region $Region `
    --filters "Name=tag:Project,Values=$Project" "Name=instance-state-name,Values=running" `
    --query "Reservations[0].Instances[0].InstanceId" --output text)
if (-not $Instance -or $Instance -eq "None") {
  throw "running な EC2 が見つかりません（terraform apply 済みか確認してください）"
}
Write-Host "instance: $Instance"

# EC2 上で実行する bash。__XXX__ は後で PowerShell の値に置換する（bash の $ はそのまま残す）。
$bash = @'
set -euo pipefail
REGION=__REGION__
PROJECT=__PROJECT__
BUCKET=__BUCKET__
PREFIX=__PREFIX__
HOST=$(aws ssm get-parameter --region $REGION --name /$PROJECT/db/host --query Parameter.Value --output text)
MPW=$(aws ssm get-parameter --region $REGION --name /$PROJECT/db/password --with-decryption --query Parameter.Value --output text)
APW=$(aws ssm get-parameter --region $REGION --name /$PROJECT/db/app_password --with-decryption --query Parameter.Value --output text)
cd /tmp
aws s3 cp s3://$BUCKET/$PREFIX/0001_init.sql 0001_init.sql --region $REGION
aws s3 cp s3://$BUCKET/$PREFIX/0002_seed.sql 0002_seed.sql --region $REGION
docker run --rm -e PGPASSWORD="$MPW" -v /tmp:/m postgres:16 \
  psql -h $HOST -U monolog_admin -d monolog -v ON_ERROR_STOP=1 -f /m/0001_init.sql -f /m/0002_seed.sql
docker run --rm -e PGPASSWORD="$MPW" postgres:16 \
  psql -h $HOST -U monolog_admin -d monolog -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE monolog_app WITH PASSWORD '$APW';"
rm -f /tmp/0001_init.sql /tmp/0002_seed.sql
'@
$bash = $bash.Replace("__REGION__", $Region).Replace("__PROJECT__", $Project).Replace("__BUCKET__", $Bucket).Replace("__PREFIX__", $Prefix)

# SSM の commands は JSON 配列。ConvertTo-Json で安全にエスケープしてファイル渡しする。
$paramsJson = @{ commands = @($bash) } | ConvertTo-Json -Compress
$tmp = Join-Path $env:TEMP "mono-log-migrate.json"
Set-Content -Path $tmp -Value $paramsJson -Encoding utf8
$tmpUri = "file://" + ($tmp -replace '\\', '/')

Write-Host "== SSM 経由で EC2 上から RDS にマイグレーション適用 ==" -ForegroundColor Cyan
$Cmd = (& $aws ssm send-command --region $Region --instance-ids $Instance `
    --document-name "AWS-RunShellScript" --parameters $tmpUri `
    --query "Command.CommandId" --output text)
Write-Host "SSM command id: $Cmd"

& $aws ssm wait command-executed --region $Region --command-id $Cmd --instance-id $Instance
$res = (& $aws ssm get-command-invocation --region $Region --command-id $Cmd --instance-id $Instance `
    --query "{Status:Status, Stdout:StandardOutputContent, Stderr:StandardErrorContent}" --output json)
Write-Host $res

# 後片付け: アップロードした SQL を S3 から削除
& $aws s3 rm "s3://$Bucket/$Prefix/" --recursive --region $Region | Out-Null
Remove-Item $tmp -ErrorAction SilentlyContinue
Write-Host "== 完了 ==" -ForegroundColor Green
