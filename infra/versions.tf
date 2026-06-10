terraform {
  # 使用する Terraform 本体のバージョン制約（1.9 以上を要求）
  required_version = ">= 1.9"

  # state の保存先（リモートバックエンド = S3）
  backend "s3" {
    bucket       = "mono-log-tfstate-194722424676" # state を置くバケット
    key          = "infra/terraform.tfstate"       # バケット内の state ファイルのパス
    region       = "ap-northeast-1"                # バケットのリージョン
    profile      = "default"                       # 認証に使う AWS プロファイル
    encrypt      = true                            # state を保存時に暗号化（SSE）
    use_lockfile = true                            # S3 ネイティブのロック（DynamoDB 不要）
  }

  # このコードが使うプロバイダの宣言
  required_providers {
    aws = {
      source  = "hashicorp/aws" # Terraform Registry 上の AWS プロバイダ
      version = "~> 6.0"        # 6.x 系を許可（最新は 6.49.0）
    }
    random = {
      source  = "hashicorp/random" # パスワード等の乱数を生成するプロバイダ
      version = "~> 3.0"           # 3.x 系を許可
    }
  }
}