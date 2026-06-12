# First-time DB migration to RDS (0001_init.sql / 0002_seed.sql) + set monolog_app password.
# RDS is private, so SQL is shipped to EC2 via S3 and applied from EC2 over SSM (psql in a container).
# Prereq: terraform apply done (RDS/EC2 running). Run once per RDS (re)creation.
# Usage (from infra/):  powershell -ExecutionPolicy Bypass -File migrate.ps1

$ErrorActionPreference = "Stop"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$Region = "ap-northeast-1"
$Project = "mono-log"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$Prefix = "_deploy/migrations"

# App bucket name (EC2 role can read objects from it).
$Bucket = (& $aws ssm get-parameter --region $Region --name "/$Project/s3/bucket" --query Parameter.Value --output text)

Write-Host "== upload migration SQL to S3 =="
& $aws s3 cp "$RepoRoot/migrations/0001_init.sql" "s3://$Bucket/$Prefix/0001_init.sql" --region $Region
& $aws s3 cp "$RepoRoot/migrations/0002_seed.sql" "s3://$Bucket/$Prefix/0002_seed.sql" --region $Region

Write-Host "== find EC2 instance =="
$Instance = (& $aws ec2 describe-instances --region $Region `
    --filters "Name=tag:Project,Values=$Project" "Name=instance-state-name,Values=running" `
    --query "Reservations[0].Instances[0].InstanceId" --output text)
if (-not $Instance -or $Instance -eq "None") {
  throw "running EC2 not found (check terraform apply)"
}
Write-Host "instance: $Instance"

# Bash to run on EC2. __XXX__ placeholders are replaced with PowerShell values below
# (bash $ stays literal because of the single-quoted here-string).
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

# SSM commands is a JSON array; ConvertTo-Json escapes safely. Pass via file.
$paramsJson = @{ commands = @($bash) } | ConvertTo-Json -Compress
$tmp = Join-Path $env:TEMP "mono-log-migrate.json"
Set-Content -Path $tmp -Value $paramsJson -Encoding ascii
$tmpUri = "file://" + ($tmp -replace '\\', '/')

Write-Host "== apply migration on RDS from EC2 via SSM =="
$Cmd = (& $aws ssm send-command --region $Region --instance-ids $Instance `
    --document-name "AWS-RunShellScript" --parameters $tmpUri `
    --query "Command.CommandId" --output text)
Write-Host "SSM command id: $Cmd"

& $aws ssm wait command-executed --region $Region --command-id $Cmd --instance-id $Instance
& $aws ssm get-command-invocation --region $Region --command-id $Cmd --instance-id $Instance `
    --query "{Status:Status, Stdout:StandardOutputContent, Stderr:StandardErrorContent}" --output json

# Cleanup uploaded SQL
& $aws s3 rm "s3://$Bucket/$Prefix/" --recursive --region $Region | Out-Null
Remove-Item $tmp -ErrorAction SilentlyContinue
Write-Host "== done =="
