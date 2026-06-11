# デプロイ / 再デプロイ手順

AWS 構成: CloudFront → EC2(Docker) → RDS(Postgres) / Cognito / S3。
コスト削減のため RDS・EC2・CloudFront は普段 destroy しておき、使うときだけ再作成する運用。

## 前提
- AWS CLI v2・Docker（buildx 有効）・Terraform 1.9+ が導入済み
- `aws sts get-caller-identity` が通る（default プロファイル）
- リージョンは `ap-northeast-1`、プロジェクト名は `mono-log`
- 残存リソース: VPC / Cognito / S3 / ECR / SSM / IAM（destroy していない）

## 再デプロイ（3ステップ）

### 1. インフラを再作成（RDS / EC2 / CloudFront）
```powershell
cd infra
terraform init      # 初回や別マシンのみ
terraform plan      # 作成内容を確認
terraform apply     # yes で作成（RDS は数分かかる）
```
- 新しい RDS エンドポイント・EC2・CloudFront が作られ、SSM パラメータと CloudFront オリジンは自動で更新される
- EC2 はこの時点ではまだアプリ未起動（イメージが ECR に無いため、systemd が 30 秒ごとに再試行中）

### 2. DB マイグレーション（RDS 再作成のたびに1回）
```powershell
powershell -File migrate.ps1
```
- `0001_init.sql` / `0002_seed.sql` を S3 経由で EC2 に渡し、SSM 経由で RDS に適用
- 併せて `monolog_app` ロールのパスワードを SSM (`/mono-log/db/app_password`) の値に設定
- 出力 `Status: Success` を確認

### 3. アプリをビルドして配備
```powershell
powershell -File deploy.ps1
```
- `linux/arm64`（t4g 用）でビルド → ECR へ push → SSM で EC2 のコンテナを更新
- 最後に表示される CloudFront ドメイン（`xxxx.cloudfront.net`）にブラウザでアクセス
- 以降アプリのコードを更新したら **3 だけ** 再実行すればよい

## 課金を止める（使い終わったら）
RDS・EC2・CloudFront だけ削除（Cognito/S3/ECR/VPC は残す）:
```powershell
cd infra
terraform destroy `
  -target=aws_cloudfront_distribution.app `
  -target=aws_instance.app `
  -target=aws_db_instance.main
```
- RDS を消すとデータも消える（再開時は手順 2 のマイグレーションをやり直す）
- 完全に消す場合は `terraform destroy`（tfstate/S3/Cognito は別管理なので残ることがある）

## メモ
- アカウントは作成 12 ヶ月超のため無料枠対象外。RDS/EC2/CloudFront は起動中ずっと課金される
- アプリの設定（DB/Cognito/S3）は EC2 起動時に SSM から読み込む（`/etc/mono-log.env` と `mono-log-run.sh`）
- ローカル開発は `compose.yaml` の Postgres + `.env.local`。本番とは独立
