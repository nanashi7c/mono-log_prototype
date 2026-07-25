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

# RDS をスナップショットから復元する一度きりの操作でのみ指定する。
# 通常は null（＝新規作成・復元しない）。復元時だけ apply に -var で渡す。
variable "db_snapshot_identifier" {
  description = "RDS 復元元スナップショット名。通常は null。復元時のみ -var で指定する。"
  type        = string
  default     = null
}