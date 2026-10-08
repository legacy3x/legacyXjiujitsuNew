-- Extra photos per store product (uploaded in the admin) — run once in Supabase → SQL Editor.
-- Safe to run more than once.
alter table public.store_products add column if not exists photos jsonb not null default '[]'::jsonb;

-- The shared photo bucket (already there if the gallery / instructor photo SQL was run).
insert into storage.buckets (id, name, public) values ('site-photos', 'site-photos', true)
on conflict (id) do nothing;
