-- One-time: removes the saved text for the three tag boxes (Kids & Youth Specialist, Team Canada Coach,
-- Gracie Humaita) that were taken off Coach Brandon's card on the Kids Jiu-Jitsu page, so the unused
-- field no longer shows in the admin. Run in Supabase → SQL Editor. Safe to run more than once.

delete from public.cms_blocks where key = 'programs/kids-jiu-jitsu/coach/coach-tags';
