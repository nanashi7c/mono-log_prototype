output "account_id" {
  description = "現在の AWS アカウント ID"
  value       = data.aws_caller_identity.current.account_id
}

output "caller_arn" {
  description = "Terraform を実行している IAM プリンシパルの ARN"
  value       = data.aws_caller_identity.current.arn
}

output "region" {
  description = "操作対象のリージョン"
  value       = data.aws_region.current.region
}