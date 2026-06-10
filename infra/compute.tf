# EC2 がこのロールを引き受けられるようにする信頼ポリシー
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

# EC2 用 IAM ロール
resource "aws_iam_role" "ec2" {
  name               = "${var.project_name}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json

  tags = {
    Name = "${var.project_name}-ec2-role"
  }
}

# SSM Session Manager（SSH不要でシェル接続できる）
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# ECR からのイメージ pull（読み取り専用）
resource "aws_iam_role_policy_attachment" "ecr_read" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# /mono-log/* の SSM パラメータ読み取り + SecureString 復号（最小権限）
data "aws_iam_policy_document" "ssm_read" {
  statement {
    sid     = "ReadAppParameters"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/*"
    ]
  }
  statement {
    sid       = "DecryptViaSsmOnly"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    # KMS 復号は SSM 経由のときだけ許可（用途を限定して安全に）
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${data.aws_region.current.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "ssm_read" {
  name   = "${var.project_name}-ssm-read"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.ssm_read.json
}

# EC2 にロールを紐付けるためのインスタンスプロファイル
resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2.name
}


# --- EC2セキュリティグループ ---

# CloudFrontのオリジン向けIP範囲（AWS管理プレフィックスリスト）
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# EC2用セキュリティグループ（CloudFrontからの80のみ許可）
resource "aws_security_group" "ec2" {
  name        = "${var.project_name}-ec2-sg"
  description = "Allow HTTP from CloudFront only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTP from CloudFront"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1" # 全プロトコル（ECR/SSMへの外向き通信に必要）
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ec2-sg"
  }
}


# --- EC2インスタンス ---

# 最新のAmazon Linux 2023（ARM64・t4g用）AMIを取得
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# アプリを動かすEC2インスタンス（Dockerコンテナ実行・public配置）
resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = "t4g.micro" # 最安のmicro（ARM/Graviton）
  subnet_id              = aws_subnet.public_a.id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  # 起動時にDockerを導入・起動（SSH鍵は使わずSSM接続）
  user_data = <<-EOF
#!/bin/bash
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user
EOF

  metadata_options {
    http_tokens = "required" # IMDSv2を強制（認証情報の盗用を防ぐ）
  }

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true # ルートボリュームを暗号化
  }

  tags = {
    Name = "${var.project_name}-ec2"
  }
}
