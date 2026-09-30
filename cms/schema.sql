-- Legacy X website CMS — run in Supabase → SQL Editor. Safe to run more than once.

-- ── Tables ──

-- Single pieces of text (headlines, paragraphs, page titles…)
create table if not exists public.cms_blocks (
  key        text primary key,
  page       text not null,
  position   integer not null default 0,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

-- Repeatable lists (FAQs, cards, testimonials, events…)
create table if not exists public.cms_lists (
  key      text primary key,
  page     text not null,
  position integer not null default 0,
  fields   text[] not null default '{}'  -- field names in page order, for the editor
);

create table if not exists public.cms_items (
  id         uuid primary key default gen_random_uuid(),
  list_key   text not null references public.cms_lists (key) on delete cascade,
  tpl        integer not null default 0,
  sort       integer not null default 0,
  fields     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists cms_items_list_key_idx on public.cms_items (list_key, sort);

-- Who may edit content (matched on the signed-in user's email)
create table if not exists public.cms_admins (
  email text primary key
);

insert into public.cms_admins (email) values ('info@legacy3x.com') on conflict (email) do nothing;

-- ── Access rules ──

create or replace function public.is_cms_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cms_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.cms_blocks enable row level security;
alter table public.cms_lists  enable row level security;
alter table public.cms_items  enable row level security;
alter table public.cms_admins enable row level security;

-- Content is public (it's on the website), so anyone may read it.
drop policy if exists "cms_blocks read" on public.cms_blocks;
create policy "cms_blocks read" on public.cms_blocks for select using (true);
drop policy if exists "cms_lists read" on public.cms_lists;
create policy "cms_lists read" on public.cms_lists for select using (true);
drop policy if exists "cms_items read" on public.cms_items;
create policy "cms_items read" on public.cms_items for select using (true);

-- Only admins may change content.
drop policy if exists "cms_blocks write" on public.cms_blocks;
create policy "cms_blocks write" on public.cms_blocks for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());
drop policy if exists "cms_items write" on public.cms_items;
create policy "cms_items write" on public.cms_items for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());

-- Signed-in users can only see their own admin row (used to check access).
drop policy if exists "cms_admins self" on public.cms_admins;
create policy "cms_admins self" on public.cms_admins for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

grant select on public.cms_blocks, public.cms_lists, public.cms_items to anon, authenticated;
grant insert, update, delete on public.cms_blocks, public.cms_items to authenticated;
grant select on public.cms_admins to authenticated;
grant execute on function public.is_cms_admin() to anon, authenticated;
