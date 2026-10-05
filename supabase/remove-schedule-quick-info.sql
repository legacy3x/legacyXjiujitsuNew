-- One-time: removes the saved text for the info bar (Class Days / Adults / Little Warriors /
-- Juniors & Next Gen / Location) that was taken off the top of the Schedule page, so the unused
-- list no longer shows in the admin. Run in Supabase → SQL Editor. Safe to run more than once.

delete from public.cms_lists where key = 'schedule/quick-info/quick-band-inner';
