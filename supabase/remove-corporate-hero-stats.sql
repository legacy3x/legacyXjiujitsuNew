-- One-time: removes the saved text for the stats box (0 / 6 / 1hr / 2×) that was taken out of the
-- Corporate page hero, so the unused list no longer shows in the admin.
-- Run in Supabase → SQL Editor. Safe to run more than once. (Deleting the list also deletes its items.)

delete from public.cms_lists where key = 'corporate/hero/hero-right';
