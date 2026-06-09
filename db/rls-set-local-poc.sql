-- PoC: Supabase の auth.uid() ベース RLS を、プレーン Postgres (AWS RDS) 向けに
--      SET LOCAL app.current_user_id + current_setting() で再現できることの検証。
--
-- 置換ルール:
--   (select auth.uid())  ->  app.current_user_id()
--   to authenticated      ->  to app_user（テーブル所有者でも superuser でもないロール）
--
-- 実行: psql でこのファイルをまるごと流す（1 セッション内で完結）。
--   docker run -d --name pg-rls-poc -e POSTGRES_PASSWORD=postgres postgres:16
--   Get-Content db/rls-set-local-poc.sql | docker exec -i pg-rls-poc psql -U postgres -d postgres

\set ON_ERROR_STOP on

----------------------------------------------------------------------
-- 1. アプリ用ロール
--    所有者でも superuser でもないため RLS が適用される（本番で Lambda/EC2 が使うロール相当）
----------------------------------------------------------------------
drop role if exists app_user;
create role app_user login password 'app_pw';

----------------------------------------------------------------------
-- 2. ヘルパー関数: セッション変数からユーザ ID を取得（Supabase の auth.uid() 相当）
--    第 2 引数 true で「未設定なら NULL」を返す（エラーにしない）
----------------------------------------------------------------------
create schema if not exists app;

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

----------------------------------------------------------------------
-- 3. テーブル（最小サブセット）
--    users: ユーザ本体（本番では Cognito の sub を id に格納する想定）
--    items: 直接所有（user_id で判定）
--    categories: マスタ的に全員読める例
--    items_categories: 親 items から所有権を継承（EXISTS 判定）
----------------------------------------------------------------------
create table public.users (
  id uuid primary key,
  email text not null unique
);

create table public.items (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null
);

create table public.categories (
  id integer generated always as identity primary key,
  name text not null
);

create table public.items_categories (
  item_id bigint not null references public.items(id) on delete cascade,
  category_id integer not null references public.categories(id) on delete cascade,
  primary key (item_id, category_id)
);

----------------------------------------------------------------------
-- 4. RLS 有効化 + ポリシー
----------------------------------------------------------------------
-- items: 所有者のみ（auth.uid() -> app.current_user_id()）
alter table public.items enable row level security;

create policy items_select on public.items for select to app_user
  using (app.current_user_id() = user_id);

create policy items_insert on public.items for insert to app_user
  with check (app.current_user_id() = user_id);

create policy items_update on public.items for update to app_user
  using (app.current_user_id() = user_id)
  with check (app.current_user_id() = user_id);

create policy items_delete on public.items for delete to app_user
  using (app.current_user_id() = user_id);

-- items_categories: 親 items の所有者のみ（継承パターン）
alter table public.items_categories enable row level security;

create policy ic_select on public.items_categories for select to app_user
  using (exists (
    select 1 from public.items i
    where i.id = item_id and i.user_id = app.current_user_id()
  ));

create policy ic_insert on public.items_categories for insert to app_user
  with check (exists (
    select 1 from public.items i
    where i.id = item_id and i.user_id = app.current_user_id()
  ));

create policy ic_delete on public.items_categories for delete to app_user
  using (exists (
    select 1 from public.items i
    where i.id = item_id and i.user_id = app.current_user_id()
  ));

-- categories: 全 app_user が読めるマスタ（auth の `using (true)` 相当）
alter table public.categories enable row level security;

create policy categories_read on public.categories for select to app_user
  using (true);

----------------------------------------------------------------------
-- 5. 権限付与
----------------------------------------------------------------------
grant usage on schema public, app to app_user;
grant execute on function app.current_user_id() to app_user;
grant select, insert, update, delete on public.items, public.items_categories to app_user;
grant select on public.categories to app_user;

----------------------------------------------------------------------
-- 6. シードデータ（所有者ロールで投入 = RLS を受けない）
----------------------------------------------------------------------
insert into public.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.com');

insert into public.items (user_id, name) values
  ('11111111-1111-1111-1111-111111111111', 'u1 のアイテムA'),
  ('11111111-1111-1111-1111-111111111111', 'u1 のアイテムB'),
  ('22222222-2222-2222-2222-222222222222', 'u2 のアイテムX');

insert into public.categories (name) values ('電子機器'), ('衣類');

insert into public.items_categories (item_id, category_id)
  select i.id, c.id from public.items i, public.categories c
  where i.name = 'u1 のアイテムA' and c.name = '電子機器';

insert into public.items_categories (item_id, category_id)
  select i.id, c.id from public.items i, public.categories c
  where i.name = 'u2 のアイテムX' and c.name = '衣類';

----------------------------------------------------------------------
-- 7. 検証: app_user として SET LOCAL でユーザを切り替え、行が分離されることを確認
----------------------------------------------------------------------
set role app_user;

-- (a) u1 として（items は 2 件、items_categories は 1 件が期待値）
begin;
  set local app.current_user_id = '11111111-1111-1111-1111-111111111111';
  select '(a) u1 items 件数' as test, count(*) as rows from public.items;
  select name from public.items order by name;
  select '(a) u1 items_categories 件数' as test, count(*) as rows from public.items_categories;
commit;

-- (b) u2 として（items は 1 件、items_categories は 1 件が期待値）
begin;
  set local app.current_user_id = '22222222-2222-2222-2222-222222222222';
  select '(b) u2 items 件数' as test, count(*) as rows from public.items;
  select name from public.items order by name;
  select '(b) u2 items_categories 件数' as test, count(*) as rows from public.items_categories;
commit;

-- (c) 未設定（未ログイン相当）→ 0 件が期待値
begin;
  select '(c) 未設定 items 件数' as test, count(*) as rows from public.items;
commit;

-- (d) WITH CHECK: u1 が u2 になりすまして INSERT → RLS で拒否されるのが期待値
begin;
  set local app.current_user_id = '11111111-1111-1111-1111-111111111111';
  do $$
  begin
    insert into public.items (user_id, name)
      values ('22222222-2222-2222-2222-222222222222', 'なりすまし');
    raise notice '(d) NG: なりすまし INSERT が成功してしまった';
  exception when others then
    raise notice '(d) OK: なりすまし INSERT は RLS で拒否された (%)', sqlerrm;
  end$$;
rollback;
