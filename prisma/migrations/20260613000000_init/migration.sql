-- mono-log AWS版 完全スキーマ（v1相当・Cognito/RLS対応）
-- auth.uid() → app.current_user_id()、auth.users/profiles → public.users（Cognito sub）。
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
