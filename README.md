# mono-log

所有物管理アプリ。Next.js (App Router) + TypeScript + Tailwind + Supabase (Auth / Postgres / Storage)。

## 機能

- メール+パスワード認証（Supabase Auth）
- アイテムの CRUD（名前・カテゴリ・タグ・購入日・価格・メモ・画像）
- カテゴリは自分用に作成・選択（同名 unique）。新規追加もフォームから可能
- 一覧でのキーワード検索（名前・メモ・タグ）／カテゴリ絞り込み（「未分類」も指定可）
- ダッシュボード：登録数 / 合計金額 / 平均 / カテゴリ別の数と金額バー
- JSON エクスポート／インポート（アイテム + カテゴリ。画像はパスのみ）

## セットアップ

### 1. Supabase プロジェクトを用意

[Supabase](https://supabase.com/) で新規プロジェクトを作成し、`Settings → API` から下記2つを控える。

- Project URL
- `anon`（または `publishable`）key

### 2. スキーマを適用

`supabase/migrations/0001_initial_schema.sql` を Supabase Dashboard の `SQL Editor` に貼り付けて実行。

このマイグレーションで以下が作成されます。

- テーブル: `public.categories` / `public.items`（いずれも RLS 有効・`auth.uid()` ベース）
- ストレージ: `item-images` バケット（非公開）と `<user_id>/<item_id>/...` の所有者ポリシー（SELECT / INSERT / UPDATE / DELETE）
- トリガ: `items.updated_at` の自動更新

### 3. 認証設定

`Authentication → Providers → Email` を有効化。  
メール確認が `ON` の場合、サインアップ直後はログインできず確認メール内のリンクを踏む必要があります。コールバック URL は

```
http://localhost:3000/auth/callback
```

を `Authentication → URL Configuration → Redirect URLs` に追加してください。

### 4. 環境変数

```bash
cp .env.local.example .env.local
# NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を埋める
```

### 5. インストール & 起動

```bash
npm install
npm run dev
# http://localhost:3000
```

## ディレクトリ構成

```
src/
  app/
    layout.tsx          ルートレイアウト + NavBar
    page.tsx            一覧（検索・フィルタ）
    login/, signup/     認証フォーム + Server Actions
    auth/callback       メール確認後の Code 交換
    auth/signout        ログアウト POST
    items/
      actions.ts        create / update / delete
      new/              追加ページ
      [id]/edit/        編集ページ
    dashboard/          集計
    import/             JSON 取り込み
    api/export/         JSON ダウンロード
  components/           UI (item-card / item-form / filter-bar / nav-bar)
  lib/
    supabase/{client,server,middleware}.ts   @supabase/ssr 標準パターン
    image.ts            署名付き URL 生成
    format.ts           ¥ / 日付フォーマット
  middleware.ts         セッション更新と未ログイン時のリダイレクト
  types/item.ts
supabase/migrations/0001_initial_schema.sql
```

## セキュリティ上の方針

このコードは Supabase の標準セキュリティ手順に沿って書かれています。

- `public` の全テーブルで RLS 有効、ポリシーは `TO authenticated` + `(select auth.uid()) = user_id` ペア（BOLA 回避）
- UPDATE ポリシーは `USING` と `WITH CHECK` を両方指定（行の所有者変更を防止）
- Storage バケット `item-images` は非公開で、所有者の `<user_id>/...` プレフィックスでのみ操作可。upsert を将来許す場合に備え SELECT / INSERT / UPDATE / DELETE を揃えています
- `service_role` キーは使用しません（クライアント・サーバ共に `anon` キーのみ）
- 認可判定に `user_metadata` を使いません

## 既知の制限

- 画像は1アイテムあたり1枚
- インポートは追記のみ（重複検出なし）
- 単一ユーザーモデル（共有・閲覧権限の譲渡は無し）
