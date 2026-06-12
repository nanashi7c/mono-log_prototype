# 付録D: データ基盤の実装手順＋逐行解説

[setup-guide.md](setup-guide.md) の8章・11章の詳細版。アプリ／APIがコンパイル・起動するのに必須の土台を**ファイル作成の手順形式**で作り、各コードの直後に**逐行解説**を付けます。

作成順（依存の都合でこの順）:
1. `migrations/0001_init.sql`（DDL＋RLS＋ロール）
2. `migrations/0002_seed.sql`（マスタ＋プリセット）
3. `src/types/item.ts`（型。先に作る）
4. `src/db/schema.ts`（Drizzle定義。types不要だが概念上ここ）
5. `src/db/serialize.ts`（schema/typesに依存）
6. ローカル適用＆型チェックで確認
7. `infra/migrate.ps1`（本番RDSへの適用スクリプト）

> 関係: SQL(①)が実テーブルを作り、Drizzle(④)が同じ表を「コードの型」として定義、serialize(⑤)が結果を型(③)の形へ整える。**SQLとschema.tsは手で対応を合わせる**（drizzle-kitの自動生成は使わない＝RLS/ロールを手書きSQLで管理するため）。

---

## Step 1. `migrations/0001_init.sql` を作成

```sql
-- mono-log AWS版 完全スキーマ（v1相当・Cognito/RLS対応）
-- アプリは非所有者ロール monolog_app で接続し、RLS が適用される。

create schema if not exists app;

create or replace function app.current_user_id()
returns uuid language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'item_status') then
    create type public.item_status as enum ('planned','owned','listed','sold');
  end if;
end$$;

-- users（auth.users + profiles の代替。id = Cognito sub）
create table public.users (
  id         uuid primary key,
  email      text not null unique,
  username   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger users_set_updated_at before update on public.users
  for each row execute function app.set_updated_at();

-- categories（プリセット + ユーザ作成）
create table public.categories (
  id integer generated always as identity primary key,
  user_id uuid references public.users(id) on delete cascade,
  name text not null,
  color text not null default '#94a3b8',
  is_preset boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_owner_or_preset check (
    (is_preset and user_id is null) or (not is_preset and user_id is not null)
  ),
  unique nulls not distinct (user_id, name)
);
create index categories_user_idx on public.categories (user_id);
create trigger categories_set_updated_at before update on public.categories
  for each row execute function app.set_updated_at();

-- items（全カラム）
create table public.items (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  status public.item_status not null,
  name varchar(255) not null,
  image_url text,
  jan_code varchar(13),
  quantity integer not null check (quantity > 0),
  notes text,
  actual_price integer check (actual_price is null or actual_price >= 0),
  purchased_at date,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_user_status_idx on public.items (user_id, status, created_at desc);
create index items_user_active_idx on public.items (user_id) where deleted_at is null;
create trigger items_set_updated_at before update on public.items
  for each row execute function app.set_updated_at();

-- items_categories（M:N）
create table public.items_categories (
  item_id bigint not null references public.items(id) on delete cascade,
  category_id integer not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, category_id)
);
create index items_categories_category_idx on public.items_categories (category_id);

-- plans
create table public.plans (
  id bigint generated always as identity primary key,
  item_id bigint not null unique references public.items(id) on delete cascade,
  planned_purchase_year smallint,
  planned_purchase_month smallint check (planned_purchase_month is null or planned_purchase_month between 1 and 12),
  list_price numeric(10,0) check (list_price is null or list_price >= 0),
  purchase_price numeric(10,0) check (purchase_price is null or purchase_price >= 0),
  product_url text,
  deal_period varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_set_updated_at before update on public.plans
  for each row execute function app.set_updated_at();

-- master: platforms / services / sizes
create table public.platforms (
  id integer generated always as identity primary key,
  name text not null unique,
  fee_rate numeric(5,4) not null check (fee_rate >= 0 and fee_rate <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger platforms_set_updated_at before update on public.platforms
  for each row execute function app.set_updated_at();

create table public.services (
  id integer generated always as identity primary key,
  shipping_service text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger services_set_updated_at before update on public.services
  for each row execute function app.set_updated_at();

create table public.sizes (
  id integer generated always as identity primary key,
  shipping_size text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sizes_set_updated_at before update on public.sizes
  for each row execute function app.set_updated_at();

create table public.shipping (
  id bigint generated always as identity primary key,
  shipping_service_id integer not null references public.services(id),
  shipping_size_id integer not null references public.sizes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipping_service_id, shipping_size_id)
);
create trigger shipping_set_updated_at before update on public.shipping
  for each row execute function app.set_updated_at();

create table public.shipping_fees (
  id bigint generated always as identity primary key,
  shipping_service_id integer not null references public.services(id),
  shipping_size_id integer not null references public.sizes(id),
  fee numeric(10,0) not null check (fee >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipping_service_id, shipping_size_id)
);
create trigger shipping_fees_set_updated_at before update on public.shipping_fees
  for each row execute function app.set_updated_at();

-- listings（利益計算列はアプリが算出してセット）
create table public.listings (
  id bigint generated always as identity primary key,
  item_id bigint not null unique references public.items(id) on delete cascade,
  shipping_id bigint references public.shipping(id),
  platform_id integer references public.platforms(id),
  quantity integer check (quantity is null or quantity > 0),
  selling_price numeric(10,0) check (selling_price is null or selling_price >= 0),
  packaging_cost numeric(10,0) check (packaging_cost is null or packaging_cost >= 0),
  work_time_hours numeric(8,2) check (work_time_hours is null or work_time_hours >= 0),
  labor_rate numeric(10,0) check (labor_rate is null or labor_rate >= 0),
  selling_fee numeric(10,0),
  work_time_cost numeric(10,0),
  operating_benefit numeric(10,0),
  ordinary_profit numeric(10,0),
  is_listing boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger listings_set_updated_at before update on public.listings
  for each row execute function app.set_updated_at();

-- アプリ用ロール（非所有者・非superuser）
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'monolog_app') then
    create role monolog_app login password 'localapppw';
  end if;
end$$;

grant usage on schema public, app to monolog_app;
grant execute on function app.current_user_id() to monolog_app;
grant select, insert, update, delete on
  public.users, public.categories, public.items, public.items_categories,
  public.plans, public.listings to monolog_app;
grant select on public.platforms, public.services, public.sizes, public.shipping_fees to monolog_app;
grant select, insert on public.shipping to monolog_app;

-- RLS（ユーザ系のみ。マスタは参照用でRLSなし）
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.items_categories enable row level security;
alter table public.plans enable row level security;
alter table public.listings enable row level security;

create policy users_select on public.users for select using (id = app.current_user_id());
create policy users_insert on public.users for insert with check (id = app.current_user_id());
create policy users_update on public.users for update using (id = app.current_user_id()) with check (id = app.current_user_id());

create policy categories_select on public.categories for select using (is_preset or user_id = app.current_user_id());
create policy categories_insert on public.categories for insert with check (user_id = app.current_user_id() and not is_preset);
create policy categories_update on public.categories for update using (user_id = app.current_user_id()) with check (user_id = app.current_user_id());
create policy categories_delete on public.categories for delete using (user_id = app.current_user_id());

create policy items_select on public.items for select using (user_id = app.current_user_id());
create policy items_insert on public.items for insert with check (user_id = app.current_user_id());
create policy items_update on public.items for update using (user_id = app.current_user_id()) with check (user_id = app.current_user_id());
create policy items_delete on public.items for delete using (user_id = app.current_user_id());

create policy items_categories_select on public.items_categories for select using (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));
create policy items_categories_insert on public.items_categories for insert with check (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));
create policy items_categories_delete on public.items_categories for delete using (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));

create policy plans_select on public.plans for select using (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));
create policy plans_insert on public.plans for insert with check (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));
create policy plans_update on public.plans for update using (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id())) with check (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));
create policy plans_delete on public.plans for delete using (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));

create policy listings_select on public.listings for select using (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));
create policy listings_insert on public.listings for insert with check (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));
create policy listings_update on public.listings for update using (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id())) with check (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));
create policy listings_delete on public.listings for delete using (exists (select 1 from public.items i where i.id = item_id and i.user_id = app.current_user_id()));
```
**逐行解説**
- `create schema if not exists app;`: 関数を置く名前空間`app`。
- `app.current_user_id()`: **RLSの基準値**。`current_setting('app.current_user_id', true)`(未設定でもエラーにせずnull)を`nullif(...,'')`で空→null、`::uuid`でキャスト。`withUser`がここに`sub`を入れる。
- `app.set_updated_at()`: 更新時に`new.updated_at := now()`で更新時刻を自動更新するトリガ関数。
- `do $$ ... if not exists (... pg_type ... 'item_status') then create type ... enum (...) ...`: 4状態の列挙型を二重作成しないガード付きで作成。
- `create table public.users (...)`: 主キー`id uuid`(=Cognito sub)、`email`必須・一意、`username`必須、作成/更新時刻。続く`create trigger`で更新時刻を自動化(以後の各テーブルも同様)。
- `create table public.categories (...)`:
  - `id integer generated always as identity primary key`: 自動採番。
  - `user_id uuid references public.users(id) on delete cascade`: 所有者FK(NULL可＝プリセット用、連動削除)。
  - `constraint categories_owner_or_preset check (...)`: 「プリセットならuser_id null」「非プリセットならuser_id必須」を強制。
  - `unique nulls not distinct (user_id, name)`: 同名禁止(NULL同士も同一扱い)。
- `create table public.items (...)`:
  - `id bigint ... identity`、`user_id ... not null references users(id) on delete cascade`(必須FK)。
  - `status public.item_status not null`(列挙)、`name varchar(255) not null`、`quantity ... check (quantity > 0)`、`actual_price ... check (null or >= 0)`、`purchased_at date`、`deleted_at`(論理削除用)。
  - 2インデックス: 一覧用と、`where deleted_at is null`の**部分インデックス**。
- `items_categories`: M:N中間表。双方FK＋`primary key (item_id, category_id)`で重複防止。
- `plans`: `item_id ... unique`でitemsと1:1。`planned_purchase_month ... between 1 and 12`等のcheck。
- `platforms/services/sizes/shipping/shipping_fees`: マスタ群。`fee_rate numeric(5,4) check (0〜1)`(手数料率)、`shipping`はサービス×サイズの組合せ(両FK＋`unique`)、`shipping_fees`はその送料。
- `listings`: `item_id ... unique`で1:1。`selling_price`〜`labor_rate`が入力、`selling_fee`〜`is_listing`は**アプリが計算してセットする列**。
- `do $$ ... create role monolog_app login password 'localapppw' ...`: **アプリ接続ロール**を作成(非所有者＝RLSが効く。初期パスワードは本番でALTER ROLE)。
- `grant ...`: スキーマ利用・基準関数実行・ユーザ系テーブルCRUD・マスタ参照・shippingの参照＋挿入を許可。
- `alter table ... enable row level security`: 各テーブルでRLS有効化。
- `create policy ... for select using (...)` / `for insert with check (...)`: **`using`=対象行の条件、`with check`=書き込む値の条件**。
  - users/categories/items: 自分の`user_id`(usersは`id`)か。categoriesのselectのみ`is_preset or ...`でプリセットも可視、insertは`and not is_preset`でプリセット作成禁止。
  - items_categories/plans/listings: `exists (select 1 from items i where i.id = item_id and i.user_id = app.current_user_id())`で**親アイテムが自分のものか**を判定(自前のuser_idが無いため)。

---

## Step 2. `migrations/0002_seed.sql` を作成

```sql
-- マスタ＋プリセットカテゴリの seed。ON CONFLICT DO NOTHING で再実行は no-op。

insert into public.platforms (name, fee_rate) values
  ('メルカリ',       0.1000),
  ('ラクマ',         0.0600),
  ('Yahoo!フリマ',   0.0500),
  ('Yahoo!オークション', 0.1000)
on conflict (name) do nothing;

insert into public.services (shipping_service) values
  ('らくらくメルカリ便'),
  ('ゆうゆうメルカリ便'),
  ('ヤマト宅急便'),
  ('日本郵便（ゆうパック）')
on conflict (shipping_service) do nothing;

insert into public.sizes (shipping_size) values
  ('ネコポス'),
  ('ゆうパケット'),
  ('宅急便コンパクト'),
  ('60サイズ'),
  ('80サイズ'),
  ('100サイズ'),
  ('120サイズ'),
  ('140サイズ'),
  ('160サイズ')
on conflict (shipping_size) do nothing;

with svc as (select id, shipping_service from public.services),
     sz  as (select id, shipping_size from public.sizes)
insert into public.shipping_fees (shipping_service_id, shipping_size_id, fee)
select s.id, z.id, f.fee
from (values
  ('らくらくメルカリ便',  'ネコポス',         210),
  ('らくらくメルカリ便',  '宅急便コンパクト', 450),
  ('らくらくメルカリ便',  '60サイズ',          750),
  ('らくらくメルカリ便',  '80サイズ',          850),
  ('らくらくメルカリ便',  '100サイズ',        1050),
  ('らくらくメルカリ便',  '120サイズ',        1200),
  ('らくらくメルカリ便',  '140サイズ',        1450),
  ('らくらくメルカリ便',  '160サイズ',        1700),
  ('ゆうゆうメルカリ便',  'ゆうパケット',      215),
  ('ゆうゆうメルカリ便',  '60サイズ',          770),
  ('ゆうゆうメルカリ便',  '80サイズ',          870),
  ('ゆうゆうメルカリ便',  '100サイズ',        1070),
  ('ヤマト宅急便',         '60サイズ',          940),
  ('ヤマト宅急便',         '80サイズ',         1150),
  ('ヤマト宅急便',         '100サイズ',        1390),
  ('ヤマト宅急便',         '120サイズ',        1610),
  ('ヤマト宅急便',         '140サイズ',        1850),
  ('ヤマト宅急便',         '160サイズ',        2070),
  ('日本郵便（ゆうパック）','60サイズ',          810),
  ('日本郵便（ゆうパック）','80サイズ',         1030),
  ('日本郵便（ゆうパック）','100サイズ',        1270),
  ('日本郵便（ゆうパック）','120サイズ',        1510),
  ('日本郵便（ゆうパック）','140サイズ',        1760),
  ('日本郵便（ゆうパック）','160サイズ',        2010)
) as f(service, size, fee)
join svc s on s.shipping_service = f.service
join sz  z on z.shipping_size = f.size
on conflict (shipping_service_id, shipping_size_id) do nothing;

insert into public.categories (user_id, name, is_preset, color) values
  (null, '電子機器',           true, '#4a6cf7'),
  (null, '衣類',               true, '#ec4899'),
  (null, '本・コミック',       true, '#f59e0b'),
  (null, 'ホビー・おもちゃ',   true, '#10b981'),
  (null, '家具・インテリア',   true, '#a855f7'),
  (null, '食品・飲料',         true, '#ef4444'),
  (null, 'スポーツ',           true, '#06b6d4'),
  (null, '美容・健康',         true, '#f472b6'),
  (null, 'その他',             true, '#94a3b8')
on conflict (user_id, name) do nothing;
```
**逐行解説**
- `insert into ... values (...),(...) on conflict (列) do nothing`: 複数行を一括挿入し、既存キーは**何もしない**(再実行しても安全＝冪等)。platforms/services/sizesはこの形。
- `fee_rate`は小数(例`0.1000`=10%)。
- shipping_fees: `with svc/sz`で名前→idの対応表を作り、`from (values (...名前..., 料金)) as f(...)`の仮想表を`join`してidに変換しつつ挿入(idを直書きしない)。
- categories: プリセットは`user_id`が`null`・`is_preset`が`true`(Step1のcheckを満たす)。

---

## Step 3. `src/types/item.ts` を作成

```ts
export type ItemStatus = "planned" | "owned" | "listed" | "sold";

export type Category = {
  id: number;
  user_id: string | null;
  name: string;
  color: string;
  is_preset: boolean;
  created_at: string;
  updated_at: string;
};

export type Item = {
  id: number;
  user_id: string;
  status: ItemStatus;
  name: string;
  image_url: string | null;
  jan_code: string | null;
  quantity: number;
  actual_price: number | null;
  purchased_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  notes: string | null;
};

export type ItemCategory = {
  item_id: number;
  category_id: number;
  created_at: string;
};

export type Plan = {
  id: number;
  item_id: number;
  planned_purchase_year: number | null;
  planned_purchase_month: number | null;
  list_price: number | null;
  purchase_price: number | null;
  product_url: string | null;
  deal_period: string | null;
  created_at: string;
  updated_at: string;
};

export type Platform = {
  id: number;
  name: string;
  fee_rate: number;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: number;
  shipping_service: string;
  created_at: string;
  updated_at: string;
};

export type Size = {
  id: number;
  shipping_size: string;
  created_at: string;
  updated_at: string;
};

export type Shipping = {
  id: number;
  shipping_service_id: number;
  shipping_size_id: number;
  created_at: string;
  updated_at: string;
};

export type ShippingFee = {
  id: number;
  shipping_service_id: number;
  shipping_size_id: number;
  fee: number;
  created_at: string;
  updated_at: string;
};

export type Listing = {
  id: number;
  item_id: number;
  shipping_id: number | null;
  platform_id: number | null;
  quantity: number | null;
  selling_price: number | null;
  packaging_cost: number | null;
  work_time_hours: number | null;
  labor_rate: number | null;
  selling_fee: number | null;
  work_time_cost: number | null;
  operating_benefit: number | null;
  ordinary_profit: number | null;
  is_listing: boolean | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: number;
  user_id: string;
  username: string;
  created_at: string;
  updated_at: string;
};

export type ItemWithCategories = Item & {
  categories: Pick<Category, "id" | "name" | "color">[];
};

export type PlannedItem = ItemWithCategories & { plan: Plan | null };
export type ListedItem = ItemWithCategories & { listing: Listing | null };
```
**逐行解説**
- 全型は**snake_case**(serializeの出力＝API/UIが使う形に一致)。
- `ItemStatus`: 4状態のユニオン型。
- `Item`/`Category`/`Plan`/`Listing`/各マスタ: Step1のテーブル列に1対1対応。`number | null`等でNULL許容を表現、日時は`string`(ISO/日付文字列)。
- `ItemWithCategories = Item & {...}`: **交差型**(Item＋`categories`配列)。`Pick<Category, "id"|"name"|"color">`はCategoryから3項目だけ抜いた型。
- `PlannedItem`/`ListedItem`: さらに`plan`/`listing`を足した画面用型。

---

## Step 4. `src/db/schema.ts` を作成

```ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  bigint,
  varchar,
  integer,
  smallint,
  numeric,
  boolean,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itemStatus = pgEnum("item_status", ["planned", "owned", "listed", "sold"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull(),
  ...timestamps(),
});

export const categories = pgTable("categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#94a3b8"),
  isPreset: boolean("is_preset").notNull().default(false),
  ...timestamps(),
});

export const items = pgTable("items", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: itemStatus("status").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  imageUrl: text("image_url"),
  janCode: varchar("jan_code", { length: 13 }),
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
  actualPrice: integer("actual_price"),
  purchasedAt: date("purchased_at"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps(),
});

export const itemsCategories = pgTable(
  "items_categories",
  {
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.categoryId] })],
);

export const plans = pgTable("plans", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  itemId: bigint("item_id", { mode: "number" })
    .notNull()
    .unique()
    .references(() => items.id, { onDelete: "cascade" }),
  plannedPurchaseYear: smallint("planned_purchase_year"),
  plannedPurchaseMonth: smallint("planned_purchase_month"),
  listPrice: numeric("list_price", { mode: "number" }),
  purchasePrice: numeric("purchase_price", { mode: "number" }),
  productUrl: text("product_url"),
  dealPeriod: varchar("deal_period", { length: 255 }),
  ...timestamps(),
});

export const platforms = pgTable("platforms", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  feeRate: numeric("fee_rate", { mode: "number" }).notNull(),
  ...timestamps(),
});

export const services = pgTable("services", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shippingService: text("shipping_service").notNull().unique(),
  ...timestamps(),
});

export const sizes = pgTable("sizes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  shippingSize: text("shipping_size").notNull().unique(),
  ...timestamps(),
});

export const shipping = pgTable("shipping", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  shippingServiceId: integer("shipping_service_id")
    .notNull()
    .references(() => services.id),
  shippingSizeId: integer("shipping_size_id")
    .notNull()
    .references(() => sizes.id),
  ...timestamps(),
});

export const shippingFees = pgTable("shipping_fees", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  shippingServiceId: integer("shipping_service_id")
    .notNull()
    .references(() => services.id),
  shippingSizeId: integer("shipping_size_id")
    .notNull()
    .references(() => sizes.id),
  fee: numeric("fee", { mode: "number" }).notNull(),
  ...timestamps(),
});

export const listings = pgTable("listings", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  itemId: bigint("item_id", { mode: "number" })
    .notNull()
    .unique()
    .references(() => items.id, { onDelete: "cascade" }),
  shippingId: bigint("shipping_id", { mode: "number" }).references(() => shipping.id),
  platformId: integer("platform_id").references(() => platforms.id),
  quantity: integer("quantity"),
  sellingPrice: numeric("selling_price", { mode: "number" }),
  packagingCost: numeric("packaging_cost", { mode: "number" }),
  workTimeHours: numeric("work_time_hours", { mode: "number" }),
  laborRate: numeric("labor_rate", { mode: "number" }),
  sellingFee: numeric("selling_fee", { mode: "number" }),
  workTimeCost: numeric("work_time_cost", { mode: "number" }),
  operatingBenefit: numeric("operating_benefit", { mode: "number" }),
  ordinaryProfit: numeric("ordinary_profit", { mode: "number" }),
  isListing: boolean("is_listing"),
  ...timestamps(),
});
```
**逐行解説**
- `import { pgTable, ... } from "drizzle-orm/pg-core"`: 列の型ビルダー群。
- 列は`型("DB列名", オプション).修飾()`。例`timestamp("created_at", { withTimezone: true }).notNull().defaultNow()`＝`timestamptz not null default now()`。
- `const timestamps = () => ({ createdAt..., updatedAt... })`: 共通の作成/更新時刻。`...timestamps()`で各テーブルに展開。
- `pgEnum("item_status", [...])`: Step1の列挙型に対応。
- `pgTable("users", { id: uuid("id").primaryKey(), email: text("email").notNull().unique(), ... })`: キーは**コード名(camelCase)**、`text("...")`の引数が**DB列名(snake_case)**。
- `bigint("id", { mode: "number" })`: JSでnumber扱い。`.generatedAlwaysAsIdentity()`=自動採番。
- `.references(() => users.id, { onDelete: "cascade" })`: FK(連動削除)。
- `itemsCategories`の第2引数`(t) => [primaryKey({ columns: [t.itemId, t.categoryId] })]`: 複合主キー。
- `plans`/`listings`の`.unique()`: itemsと1:1。
- 各列の型・制約は**Step1のSQLと1対1**で対応する（手で合わせる）。

---

## Step 5. `src/db/serialize.ts` を作成

```ts
import type { InferSelectModel } from "drizzle-orm";
import { items, categories, plans, listings } from "./schema";
import type { Item, Category, Plan, Listing } from "@/types/item";

type ItemRow = InferSelectModel<typeof items>;
type CategoryRow = InferSelectModel<typeof categories>;
type PlanRow = InferSelectModel<typeof plans>;
type ListingRow = InferSelectModel<typeof listings>;

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : v;
}
function isoOrNull(v: Date | string | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export function toItem(r: ItemRow): Item {
  return {
    id: r.id,
    user_id: r.userId,
    status: r.status,
    name: r.name,
    image_url: r.imageUrl,
    jan_code: r.janCode,
    quantity: r.quantity,
    notes: r.notes,
    actual_price: r.actualPrice,
    purchased_at: r.purchasedAt,
    deleted_at: isoOrNull(r.deletedAt),
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}

export function toCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    user_id: r.userId,
    name: r.name,
    color: r.color,
    is_preset: r.isPreset,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}

export function toPlan(r: PlanRow): Plan {
  return {
    id: r.id,
    item_id: r.itemId,
    planned_purchase_year: r.plannedPurchaseYear,
    planned_purchase_month: r.plannedPurchaseMonth,
    list_price: r.listPrice,
    purchase_price: r.purchasePrice,
    product_url: r.productUrl,
    deal_period: r.dealPeriod,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}

export function toListing(r: ListingRow): Listing {
  return {
    id: r.id,
    item_id: r.itemId,
    shipping_id: r.shippingId,
    platform_id: r.platformId,
    quantity: r.quantity,
    selling_price: r.sellingPrice,
    packaging_cost: r.packagingCost,
    work_time_hours: r.workTimeHours,
    labor_rate: r.laborRate,
    selling_fee: r.sellingFee,
    work_time_cost: r.workTimeCost,
    operating_benefit: r.operatingBenefit,
    ordinary_profit: r.ordinaryProfit,
    is_listing: r.isListing,
    created_at: iso(r.createdAt),
    updated_at: iso(r.updatedAt),
  };
}
```
**逐行解説**
- このファイルは**camelCase(Drizzle結果) → snake_case(アプリ型)変換層**。これにより画面/APIの型を変えずにバックエンドを差し替えられる。
- `import type { InferSelectModel } from "drizzle-orm"`: テーブル定義から「SELECT結果の型」を導出するユーティリティ型。
- `type ItemRow = InferSelectModel<typeof items>`: itemsの行型(camelCase・日時はDate)。
- `iso(v)`: `Date`ならISO文字列、文字列ならそのまま。`isoOrNull`はnull許容版。
- `toItem(r)`: Drizzle行`r`を`Item`型へ詰め替え。`r.userId → user_id`、`r.imageUrl → image_url`等。`purchased_at`はdate型で既に"YYYY-MM-DD"文字列なのでそのまま、`deleted_at`/`created_at`/`updated_at`は`iso`系で文字列化。
- `toCategory`/`toPlan`/`toListing`も同じ要領（列名をsnake_caseに直し、日時をiso化）。

---

## Step 6. ローカル適用＆型チェックで確認

```bash
# ローカルDB（9章で compose 起動済み前提）にスキーマ＋seedを適用
docker run --rm -e PGPASSWORD=localdev -v "$PWD/migrations:/m" --network host postgres:16 \
  psql -h localhost -p 5433 -U monolog_admin -d monolog -v ON_ERROR_STOP=1 \
  -f /m/0001_init.sql -f /m/0002_seed.sql

# 型チェック（schema/serialize/types と付録Bが揃っていれば通る）
npx tsc --noEmit
```
**逐行解説**
- `docker run --rm -e PGPASSWORD=localdev -v "$PWD/migrations:/m" --network host postgres:16 psql ...`: 使い捨ての`postgres:16`コンテナで`psql`を実行。`-v`でmigrationsをマウント、`--network host`でローカルの5433に接続、`-U monolog_admin`(所有者)、`-v ON_ERROR_STOP=1`でエラー即停止、`-f`で2本適用。
- 適用後、`monolog_app`ロールが初期パスワード`localapppw`で作られる(`.env.local`の`DB_PASSWORD=localapppw`と一致)。
- `npx tsc --noEmit`: 型エラーが無いか確認。

---

## Step 7. `infra/migrate.ps1` を作成（本番RDSへの適用）

RDSは非公開なので、SQLをS3経由でEC2に渡し、EC2の`psql`コンテナからRDSへ適用する。**RDSを作り直すたびに1回**実行（11章）。コメントはASCII（Windows PowerShell 5.1の文字化け回避）。

```powershell
# First-time DB migration to RDS (0001_init.sql / 0002_seed.sql) + set monolog_app password.
# RDS is private, so SQL is shipped to EC2 via S3 and applied from EC2 over SSM (psql in a container).
# Prereq: terraform apply done (RDS/EC2 running). Run once per RDS (re)creation.
# Usage (from infra/):  powershell -ExecutionPolicy Bypass -File migrate.ps1

$ErrorActionPreference = "Stop"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$Region = "ap-northeast-1"
$Project = "mono-log"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$Prefix = "_deploy/migrations"

# App bucket name (EC2 role can read objects from it).
$Bucket = (& $aws ssm get-parameter --region $Region --name "/$Project/s3/bucket" --query Parameter.Value --output text)

Write-Host "== upload migration SQL to S3 =="
& $aws s3 cp "$RepoRoot/migrations/0001_init.sql" "s3://$Bucket/$Prefix/0001_init.sql" --region $Region
& $aws s3 cp "$RepoRoot/migrations/0002_seed.sql" "s3://$Bucket/$Prefix/0002_seed.sql" --region $Region

Write-Host "== find EC2 instance =="
$Instance = (& $aws ec2 describe-instances --region $Region `
    --filters "Name=tag:Project,Values=$Project" "Name=instance-state-name,Values=running" `
    --query "Reservations[0].Instances[0].InstanceId" --output text)
if (-not $Instance -or $Instance -eq "None") {
  throw "running EC2 not found (check terraform apply)"
}
Write-Host "instance: $Instance"

# Bash to run on EC2. __XXX__ placeholders are replaced with PowerShell values below.
$bash = @'
set -euo pipefail
REGION=__REGION__
PROJECT=__PROJECT__
BUCKET=__BUCKET__
PREFIX=__PREFIX__
HOST=$(aws ssm get-parameter --region $REGION --name /$PROJECT/db/host --query Parameter.Value --output text)
MPW=$(aws ssm get-parameter --region $REGION --name /$PROJECT/db/password --with-decryption --query Parameter.Value --output text)
APW=$(aws ssm get-parameter --region $REGION --name /$PROJECT/db/app_password --with-decryption --query Parameter.Value --output text)
cd /tmp
aws s3 cp s3://$BUCKET/$PREFIX/0001_init.sql 0001_init.sql --region $REGION
aws s3 cp s3://$BUCKET/$PREFIX/0002_seed.sql 0002_seed.sql --region $REGION
docker run --rm -e PGPASSWORD="$MPW" -v /tmp:/m postgres:16 \
  psql -h $HOST -U monolog_admin -d monolog -v ON_ERROR_STOP=1 -f /m/0001_init.sql -f /m/0002_seed.sql
docker run --rm -e PGPASSWORD="$MPW" postgres:16 \
  psql -h $HOST -U monolog_admin -d monolog -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE monolog_app WITH PASSWORD '$APW';"
rm -f /tmp/0001_init.sql /tmp/0002_seed.sql
'@
$bash = $bash.Replace("__REGION__", $Region).Replace("__PROJECT__", $Project).Replace("__BUCKET__", $Bucket).Replace("__PREFIX__", $Prefix)

# SSM commands is a JSON array; ConvertTo-Json escapes safely. Pass via file.
$paramsJson = @{ commands = @($bash) } | ConvertTo-Json -Compress
$tmp = Join-Path $env:TEMP "mono-log-migrate.json"
Set-Content -Path $tmp -Value $paramsJson -Encoding ascii
$tmpUri = "file://" + ($tmp -replace '\\', '/')

Write-Host "== apply migration on RDS from EC2 via SSM =="
$Cmd = (& $aws ssm send-command --region $Region --instance-ids $Instance `
    --document-name "AWS-RunShellScript" --parameters $tmpUri `
    --query "Command.CommandId" --output text)
Write-Host "SSM command id: $Cmd"

& $aws ssm wait command-executed --region $Region --command-id $Cmd --instance-id $Instance
& $aws ssm get-command-invocation --region $Region --command-id $Cmd --instance-id $Instance `
    --query "{Status:Status, Stdout:StandardOutputContent, Stderr:StandardErrorContent}" --output json

# Cleanup uploaded SQL
& $aws s3 rm "s3://$Bucket/$Prefix/" --recursive --region $Region | Out-Null
Remove-Item $tmp -ErrorAction SilentlyContinue
Write-Host "== done =="
```
**逐行解説**
- `$ErrorActionPreference = "Stop"`: エラーで即停止。`$aws`はAWS CLIのパス。`$Region/$Project`は既定。
- `$RepoRoot = Split-Path $PSScriptRoot -Parent`: スクリプトの親＝リポジトリルート。`$Prefix`はS3一時置き場。
- `$Bucket = (& $aws ssm get-parameter ... /s3/bucket ...)`: SSMからバケット名取得。
- `& $aws s3 cp <ローカルSQL> s3://...`: SQL2本をS3へアップロード。
- `describe-instances --filters "Name=tag:Project..." "Name=instance-state-name,Values=running"`: 対象EC2を特定（` `` `は行継続）。`--query "Reservations[0].Instances[0].InstanceId"`でID取得。見つからなければ`throw`。
- `$bash = @' ... '@`: EC2で動かすbash。`@'...'@`は**中の`$`を展開しない**PowerShell文字列(bashの`$`を残すため)。`__XXX__`は下の`.Replace`で実値に差し替え。
  - bash内: `set -euo pipefail`(安全)、`HOST/MPW/APW`をSSMから(`--with-decryption`で復号)、S3からSQL取得、`docker run ... psql -U monolog_admin ... -f`で2本適用、もう1つの`docker run ... -c "ALTER ROLE monolog_app WITH PASSWORD '$APW'"`で**アプリ用パスワードをSSMの値へ**差し替え、一時SQL削除。
- `@{ commands = @($bash) } | ConvertTo-Json -Compress`: SSMの`{"commands":[...]}`形式JSONを生成。`Set-Content ... -Encoding ascii`でBOM混入回避。`file://`URIに変換。
- `aws ssm send-command --document-name "AWS-RunShellScript" --parameters $tmpUri`: EC2上で上のbashを実行(SSH不要)。`wait command-executed`で完了待ち、`get-command-invocation`で`Status: Success`確認。
- `aws s3 rm ... --recursive` / `Remove-Item $tmp`: 一時ファイル掃除。

> ローカルは上記`psql`部分をStep 6で実行済み。`monolog_app`は`0001`が`localapppw`で自動作成するためローカルでは`ALTER ROLE`不要。

---

## これで揃うもの
付録D(データ基盤)＋付録B(中核)＋付録C(API)＋付録A(インフラ)で、**画面UI以外はすべて手順書内に完全コード＋逐行解説**が揃います。残るUI(`app/*/page.tsx`・`components/*`・css)はリポジトリ参照。
