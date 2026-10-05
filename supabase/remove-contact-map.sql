-- One-time: removes the saved text for the address / "Open in Google Maps" block that was taken off
-- the bottom of the Contact page, so the unused fields no longer show in the admin.
-- Run in Supabase → SQL Editor. Safe to run more than once.

delete from public.cms_blocks where key like 'contact/map/%';
