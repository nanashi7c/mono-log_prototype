# Dockerイメージの保管庫（アプリのコンテナイメージを置く）
resource "aws_ecr_repository" "app" {
  name                 = "${var.project_name}-app"
  image_tag_mutability = "MUTABLE" # 同じタグの上書きを許可

  image_scanning_configuration {
    scan_on_push = true # プッシュ時に脆弱性スキャン
  }

  encryption_configuration {
    encryption_type = "AES256" # 保存時暗号化
  }

  tags = {
    Name = "${var.project_name}-app"
  }
}

# 古いイメージを自動削除（容量=コスト管理。直近10個だけ残す）
resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}