-- One-time: on the Programs page, put Competition before Jiu-Jitsu Over 55 so the
-- second row reads Competition · Jiu-Jitsu Over 55 · Private Lessons.
-- Run in Supabase → SQL Editor, then press Publish site in the admin. Safe to run more than once.

update public.cms_items
set sort = case tpl when 4 then 3 when 3 then 4 end, updated_at = now()
where list_key = 'programs/programs-grid/programs-overview-grid' and tpl in (3, 4);
