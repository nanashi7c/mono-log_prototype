variable "aws_region" {
  description = "リソースを作成する AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "aws_profile" {
  description = "認証に使う AWS CLI プロファイル名（~/.aws/credentials の項目）"
  type        = string
  default     = "default"
}

variable "project_name" {
  description = "リソース名やタグに使うプロジェクト名"
  type        = string
  default     = "mono-log"
}