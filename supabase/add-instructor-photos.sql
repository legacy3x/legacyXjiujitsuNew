-- One-time: lets the admin upload a photo for each instructor (Admin → Instructors).
-- Run in Supabase → SQL Editor. Safe to run more than once.

-- Photo storage (same bucket the homepage gallery uses; created here too in case that SQL wasn't run).
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

-- Empty photo fields for the two instructors (position puts each at the top of its section).
insert into public.cms_blocks (key, page, position, value) values
  ('instructors/head-coach-francis-yanga/coach-photo', 'instructors', 21339, ''),
  ('instructors/brandon-colvin/coach-photo', 'instructors', 25385, '')
on conflict (key) do nothing;
