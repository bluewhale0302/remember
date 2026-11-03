-- 어렴풋 user-owned word records for Supabase.
-- Run this entire file in Supabase Dashboard > SQL Editor.

create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  word text not null check (char_length(trim(word)) > 0),
  clue text not null default '',
  meaning text not null default '',
  example text not null default '',
  category text not null default '단어',
  confused text not null default '',
  difference text not null default '',
  tone text not null default 'green',
  source text not null default 'manual',
  date_label text not null default '오늘',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists words_user_created_idx
  on public.words (user_id, created_at desc);

alter table public.words enable row level security;

revoke all on table public.words from anon, authenticated;
grant select, insert, update, delete on table public.words to authenticated;

drop policy if exists "Users can read their own words" on public.words;
create policy "Users can read their own words"
  on public.words for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own words" on public.words;
create policy "Users can create their own words"
  on public.words for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own words" on public.words;
create policy "Users can update their own words"
  on public.words for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own words" on public.words;
create policy "Users can delete their own words"
  on public.words for delete to authenticated
  using ((select auth.uid()) = user_id);
