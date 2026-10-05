-- One-time: lets the admin upload a photo for each box in the homepage gallery
-- (Admin → Home → Gallery). Run in Supabase → SQL Editor. Safe to run more than once.

-- Storage for photos uploaded from the page editor (public to view; only admins can upload).
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

-- Add the (empty) photo field to the gallery list and its existing boxes.
update public.cms_lists
set fields = array_prepend('mosaic-photo', fields)
where key = 'index/gallery/mosaic' and not ('mosaic-photo' = any (fields));

update public.cms_items
set fields = fields || '{"mosaic-photo": ""}'::jsonb
where list_key = 'index/gallery/mosaic' and not (fields ? 'mosaic-photo');
