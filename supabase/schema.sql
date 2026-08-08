-- Run in Supabase SQL Editor (once per project)

create table if not exists public.likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  item_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.saves (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  item_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index if not exists likes_user_created_idx
  on public.likes (user_id, created_at desc);

create index if not exists saves_user_created_idx
  on public.saves (user_id, created_at desc);

alter table public.likes enable row level security;
alter table public.saves enable row level security;

drop policy if exists "likes_select_own" on public.likes;
drop policy if exists "likes_insert_own" on public.likes;
drop policy if exists "likes_update_own" on public.likes;
drop policy if exists "likes_delete_own" on public.likes;

create policy "likes_select_own" on public.likes
  for select using (auth.uid() = user_id);
create policy "likes_insert_own" on public.likes
  for insert with check (auth.uid() = user_id);
create policy "likes_update_own" on public.likes
  for update using (auth.uid() = user_id);
create policy "likes_delete_own" on public.likes
  for delete using (auth.uid() = user_id);

drop policy if exists "saves_select_own" on public.saves;
drop policy if exists "saves_insert_own" on public.saves;
drop policy if exists "saves_update_own" on public.saves;
drop policy if exists "saves_delete_own" on public.saves;

create policy "saves_select_own" on public.saves
  for select using (auth.uid() = user_id);
create policy "saves_insert_own" on public.saves
  for insert with check (auth.uid() = user_id);
create policy "saves_update_own" on public.saves
  for update using (auth.uid() = user_id);
create policy "saves_delete_own" on public.saves
  for delete using (auth.uid() = user_id);
