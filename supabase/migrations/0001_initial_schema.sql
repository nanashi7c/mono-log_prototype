-- mono-log initial schema
-- Tables: categories, items
-- Storage bucket: item-images
-- All tables in `public` have RLS enabled and use `(select auth.uid()) = user_id`.

----------------------------------------------------------------------
-- categories
----------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#94a3b8',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.categories enable row level security;

create policy "categories: owner can select"
  on public.categories for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "categories: owner can insert"
  on public.categories for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

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
-- items
----------------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  notes text,
  purchase_date date,
  price_yen integer check (price_yen is null or price_yen >= 0),
  tags text[] not null default '{}',
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_user_idx on public.items (user_id, created_at desc);
create index items_category_idx on public.items (category_id);
create index items_tags_idx on public.items using gin (tags);

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

-- keep updated_at fresh
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

create trigger items_set_updated_at
before update on public.items
for each row execute function public.tg_set_updated_at();

----------------------------------------------------------------------
-- storage: item-images bucket
----------------------------------------------------------------------
-- Bucket itself is private; access goes through signed URLs or RLS-checked download.
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', false)
on conflict (id) do nothing;

-- Object path convention: <user_id>/<item_id>/<filename>
-- We authorize on the first folder being the caller's auth.uid().

create policy "item-images: owner can select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "item-images: owner can insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Upsert needs UPDATE in addition to INSERT+SELECT.
create policy "item-images: owner can update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "item-images: owner can delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
