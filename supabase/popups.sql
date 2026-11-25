-- Website popups (posters) — run in Supabase → SQL Editor after setup.sql.
-- Safe to run more than once. Managed in Admin → Popups; changes are live right away.

create table if not exists public.popups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                       -- for the admin list only
  image_url   text not null,                       -- the poster
  alt_text    text not null default '',            -- read out by screen readers
  link_url    text,                                -- optional: where a click on the poster goes
  new_tab     boolean not null default false,      -- open that link in a new tab
  starts_at   timestamptz,                         -- null = showing now
  ends_at     timestamptz,                         -- null = no end date
  pages       text[] not null default '{}',        -- e.g. {index,store}; empty = every page
  frequency   text not null default 'session'
                check (frequency in ('session', 'daily', 'once', 'always')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.popups add column if not exists new_tab boolean not null default false;

-- ── Public read (website): only popups that are switched on and inside their dates ──
drop function if exists public.public_popups();
create function public.public_popups()
returns table (id uuid, image_url text, alt_text text, link_url text, new_tab boolean, pages text[], frequency text)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.image_url, p.alt_text, p.link_url, p.new_tab, p.pages, p.frequency
  from public.popups p
  where p.active
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at > now())
  order by p.created_at desc;
$$;

-- ── Access rules: admins only (the website uses public_popups above) ──
alter table public.popups enable row level security;
drop policy if exists "popups admin" on public.popups;
create policy "popups admin" on public.popups for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());

grant select, insert, update, delete on public.popups to authenticated;
grant execute on function public.public_popups() to anon, authenticated;

-- Posters are uploaded to the shared photo bucket (already there if other photo SQL was run).
insert into storage.buckets (id, name, public) values ('site-photos', 'site-photos', true)
on conflict (id) do nothing;
drop policy if exists "site photos admin insert" on storage.objects;
create policy "site photos admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-photos' and public.is_cms_admin());
drop policy if exists "site photos admin update" on storage.objects;
create policy "site photos admin update" on storage.objects for update to authenticated
  using (bucket_id = 'site-photos' and public.is_cms_admin());
drop policy if exists "site photos admin delete" on storage.objects;
create policy "site photos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-photos' and public.is_cms_admin());

-- ── Black Friday 2026: every page, once per visit, Nov 25 – Nov 30 (Woodstock time) ──
insert into public.popups (name, image_url, alt_text, starts_at, ends_at, pages, frequency)
select 'Black Friday Sale 2026', '/images/popups/black-friday-2026.jpg',
       'Black Friday membership sale at Legacy X Jiu-Jitsu, November 25 to 30, 2026: 12 weeks for $279 (Kids, Teens, Women''s Only, Adults) and 1 year for $999 (Kids, Teens, Adults)',
       timestamp '2026-11-25 00:00' at time zone 'America/Toronto',
       timestamp '2026-12-01 00:00' at time zone 'America/Toronto',
       '{}', 'session'
where not exists (select 1 from public.popups where name = 'Black Friday Sale 2026');
