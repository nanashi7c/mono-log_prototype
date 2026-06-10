# Cognitoユーザープール（認証基盤。サインアップ/ログインを管理しJWTを発行）
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-user-pool"

  username_attributes      = ["email"] # メールアドレスでサインイン
  auto_verified_attributes = ["email"] # メール確認コードを自動送信

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email" # パスワード回復は確認済みメール経由
      priority = 1
    }
  }

  tags = {
    Name = "${var.project_name}-user-pool"
  }
}

# アプリクライアント（Next.jsアプリが認証に使う）
resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project_name}-web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false # 公開クライアント想定（クライアントシークレットなし）

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH", # email+passwordでのログインを許可
    "ALLOW_USER_SRP_AUTH",      # SRP方式のログインを許可（推奨）
    "ALLOW_REFRESH_TOKEN_AUTH", # リフレッシュトークンでの再発行を許可
  ]

  access_token_validity  = 1  # アクセストークン: 1時間
  id_token_validity      = 1  # IDトークン: 1時間
  refresh_token_validity = 30 # リフレッシュトークン: 30日

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

# アプリが読むCognitoのIDをSSMに保存（非機密なのでString）
resource "aws_ssm_parameter" "cognito_user_pool_id" {
  name  = "/${var.project_name}/cognito/user_pool_id"
  type  = "String"
  value = aws_cognito_user_pool.main.id
}

resource "aws_ssm_parameter" "cognito_client_id" {
  name  = "/${var.project_name}/cognito/client_id"
  type  = "String"
  value = aws_cognito_user_pool_client.web.id
}