# VPC 本体（このプロジェクトのネットワークの器）
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16" # 使用する IP アドレス範囲（65,536 個）

  enable_dns_support   = true # VPC 内で DNS 解決を有効化
  enable_dns_hostnames = true # 起動したリソースに DNS ホスト名を付与（RDS 等で必要）

  tags = {
    Name = "${var.project_name}-vpc" # 例: mono-log-vpc
  }
}

# Internet Gateway（VPC をインターネットに接続する出入口）
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id # どの VPC に付けるか（先ほどの VPC を参照）

  tags = {
    Name = "${var.project_name}-igw"
  }
}


# --- サブネット ---

# public サブネット（EC2 を配置。外部から到達可能）
resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.0.0/24"
  availability_zone       = "ap-northeast-1a"
  map_public_ip_on_launch = true # この subnet で起動した EC2 に自動でパブリック IP を付与

  tags = {
    Name = "${var.project_name}-public-a"
  }
}

# private サブネット a（RDS 用。インターネット非公開）
resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "ap-northeast-1a"

  tags = {
    Name = "${var.project_name}-private-a"
  }
}

# private サブネット c（RDS のマルチ AZ 要件のため別 AZ にもう1つ）
resource "aws_subnet" "private_c" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "ap-northeast-1c"

  tags = {
    Name = "${var.project_name}-private-c"
  }
}


# --- ルートテーブル ---

# public 用ルートテーブル（0.0.0.0/0 を IGW へ = インターネットに出られる）
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"                  # 全ての宛先（インターネット向け）
    gateway_id = aws_internet_gateway.main.id # を IGW へ流す
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

# public サブネットを public ルートテーブルに関連付け
resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

# private 用ルートテーブル（ローカル通信のみ。インターネットへの経路は持たない）
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  # route ブロックなし = VPC 内のローカル経路（自動付与）のみ。外部へは出られない

  tags = {
    Name = "${var.project_name}-private-rt"
  }
}

# private サブネット2つを private ルートテーブルに関連付け
resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table_association" "private_c" {
  subnet_id      = aws_subnet.private_c.id
  route_table_id = aws_route_table.private.id
}
