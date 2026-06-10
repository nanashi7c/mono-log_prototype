provider "aws" {
  region  = var.aws_region  # 操作対象リージョン（variables.tf の値）
  profile = var.aws_profile # 使う認証プロファイル（variables.tf の値）

  # 作成する全リソースに自動付与する共通タグ
  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
    }
  }
}