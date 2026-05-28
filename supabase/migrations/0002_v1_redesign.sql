-- mono-log v1.1 schema redesign.
-- Drops the prototype `items` / `categories` and rebuilds against the spec:
-- items + plans + listings + platforms + shipping + shipping_fees + services + sizes + profiles.
--
-- Deviations from spec (explicitly authorized):
--   - items has additional columns retained from prototype:
--       actual_price (was price_yen), purchased_at (was purchase_date).
--   - categories has color (was retained from prototype).
--   - items <-> categories is M:N via items_categories (spec was 1:N via items.category_id).
--   - tags is dropped (replaced by M:N categories).

----------------------------------------------------------------------
-- 0. Drop prototype objects
----------------------------------------------------------------------
drop trigger if exists items_set_updated_at on public.items;
drop table if exists public.items cascade;
drop table if exists public.categories cascade;
-- public.tg_set_updated_at is recreated below.

----------------------------------------------------------------------
-- 1. Enum: item status
----------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'item_status') then
    create type public.item_status as enum ('planned', 'owned', 'listed', 'sold');
  end if;
end$$;

----------------------------------------------------------------------
-- 2. Shared trigger function: updated_at
----------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

----------------------------------------------------------------------
-- 3. categories
----------------------------------------------------------------------
create table public.categories (
  id integer generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#94a3b8',
  is_preset boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Presets are owned by no user; user categories must have an owner.
  constraint categories_owner_or_preset check (
    (is_preset and user_id is null) or (not is_preset and user_id is not null)
  ),
  -- A user cannot create two categories with the same name. Presets are also unique by name.
  unique nulls not distinct (user_id, name)
);

create index categories_user_idx on public.categories (user_id);

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.tg_set_updated_at();

alter table public.categories enable row level security;

create policy "categories: read presets and own"
  on public.categories for select
  to authenticated
  using (is_preset or (select auth.uid()) = user_id);

create policy "categories: owner can insert"
  on public.categories for insert
  to authenticated
  with check ((select auth.uid()) = user_id and not is_preset);

create policy "categories: owner can update"
  on public.categories for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "categories: owner can delete"
  on public.categories for delete
  to authenticated
  using ((select auth.uid()) = user_id);

----------------------------------------------------------------------
-- 4. items
----------------------------------------------------------------------
create table public.items (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
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

create trigger items_set_updated_at
before update on public.items
for each row execute function public.tg_set_updated_at();

alter table public.items enable row level security;

create policy "items: owner can select"
  on public.items for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "items: owner can insert"
  on public.items for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "items: owner can update"
  on public.items for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "items: owner can delete"
  on public.items for delete
  to authenticated
  using ((select auth.uid()) = user_id);

----------------------------------------------------------------------
-- 5. items_categories (M:N)
----------------------------------------------------------------------
create table public.items_categories (
  item_id bigint not null references public.items(id) on delete cascade,
  category_id integer not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, category_id)
);

create index items_categories_category_idx on public.items_categories (category_id);

alter table public.items_categories enable row level security;

-- Ownership is inherited from the referenced item.
create policy "items_categories: owner can select"
  on public.items_categories for select
  to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

create policy "items_categories: owner can insert"
  on public.items_categories for insert
  to authenticated
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

create policy "items_categories: owner can delete"
  on public.items_categories for delete
  to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

----------------------------------------------------------------------
-- 6. plans (1:1 with items where status=planned; may persist after transition)
----------------------------------------------------------------------
create table public.plans (
  id bigint generated always as identity primary key,
  item_id bigint not null unique references public.items(id) on delete cascade,
  planned_purchase_year smallint,
  planned_purchase_month smallint check (
    planned_purchase_month is null or planned_purchase_month between 1 and 12
  ),
  list_price numeric(10, 0) check (list_price is null or list_price >= 0),
  purchase_price numeric(10, 0) check (purchase_price is null or purchase_price >= 0),
  product_url text,
  deal_period varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.tg_set_updated_at();

alter table public.plans enable row level security;

create policy "plans: owner can select"
  on public.plans for select
  to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

create policy "plans: owner can insert"
  on public.plans for insert
  to authenticated
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

create policy "plans: owner can update"
  on public.plans for update
  to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

create policy "plans: owner can delete"
  on public.plans for delete
  to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

----------------------------------------------------------------------
-- 7. platforms (master)
----------------------------------------------------------------------
create table public.platforms (
  id integer generated always as identity primary key,
  name text not null unique,
  fee_rate numeric(5, 4) not null check (fee_rate >= 0 and fee_rate <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger platforms_set_updated_at
before update on public.platforms
for each row execute function public.tg_set_updated_at();

alter table public.platforms enable row level security;

create policy "platforms: read"
  on public.platforms for select
  to authenticated
  using (true);

----------------------------------------------------------------------
-- 8. services (master)
----------------------------------------------------------------------
create table public.services (
  id integer generated always as identity primary key,
  shipping_service text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger services_set_updated_at
before update on public.services
for each row execute function public.tg_set_updated_at();

alter table public.services enable row level security;

create policy "services: read"
  on public.services for select
  to authenticated
  using (true);

----------------------------------------------------------------------
-- 9. sizes (master)
----------------------------------------------------------------------
create table public.sizes (
  id integer generated always as identity primary key,
  shipping_size text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sizes_set_updated_at
before update on public.sizes
for each row execute function public.tg_set_updated_at();

alter table public.sizes enable row level security;

create policy "sizes: read"
  on public.sizes for select
  to authenticated
  using (true);

----------------------------------------------------------------------
-- 10. shipping (user-selectable config)
----------------------------------------------------------------------
create table public.shipping (
  id bigint generated always as identity primary key,
  shipping_service_id integer not null references public.services(id),
  shipping_size_id integer not null references public.sizes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipping_service_id, shipping_size_id)
);

create trigger shipping_set_updated_at
before update on public.shipping
for each row execute function public.tg_set_updated_at();

alter table public.shipping enable row level security;

create policy "shipping: read"
  on public.shipping for select
  to authenticated
  using (true);

----------------------------------------------------------------------
-- 11. shipping_fees (master)
----------------------------------------------------------------------
create table public.shipping_fees (
  id bigint generated always as identity primary key,
  shipping_service_id integer not null references public.services(id),
  shipping_size_id integer not null references public.sizes(id),
  fee numeric(10, 0) not null check (fee >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shipping_service_id, shipping_size_id)
);

create trigger shipping_fees_set_updated_at
before update on public.shipping_fees
for each row execute function public.tg_set_updated_at();

alter table public.shipping_fees enable row level security;

create policy "shipping_fees: read"
  on public.shipping_fees for select
  to authenticated
  using (true);

----------------------------------------------------------------------
-- 12. listings (1:1 with items where status=listed)
----------------------------------------------------------------------
create table public.listings (
  id bigint generated always as identity primary key,
  item_id bigint not null unique references public.items(id) on delete cascade,
  shipping_id bigint references public.shipping(id),
  platform_id integer references public.platforms(id),
  quantity integer check (quantity is null or quantity > 0),
  selling_price numeric(10, 0) check (selling_price is null or selling_price >= 0),
  packaging_cost numeric(10, 0) check (packaging_cost is null or packaging_cost >= 0),
  work_time_hours numeric(8, 2) check (work_time_hours is null or work_time_hours >= 0),
  labor_rate numeric(10, 0) check (labor_rate is null or labor_rate >= 0),
  -- The five fields below are computed by the application before write.
  selling_fee numeric(10, 0),
  work_time_cost numeric(10, 0),
  operating_benefit numeric(10, 0),
  ordinary_profit numeric(10, 0),
  is_listing boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.tg_set_updated_at();

alter table public.listings enable row level security;

create policy "listings: owner can select"
  on public.listings for select
  to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

create policy "listings: owner can insert"
  on public.listings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

create policy "listings: owner can update"
  on public.listings for update
  to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

create policy "listings: owner can delete"
  on public.listings for delete
  to authenticated
  using (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

----------------------------------------------------------------------
-- 13. profiles (1:1 with auth.users, auto-created on signup)
----------------------------------------------------------------------
create table public.profiles (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.tg_set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles: insert own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Auto-create a profile row on user signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Storage bucket `item-images` and its RLS policies are kept from 0001_initial_schema.sql.
-- Path convention: <user_id>/<item_id>/<filename>. The folder-1 = auth.uid() check is unchanged.
