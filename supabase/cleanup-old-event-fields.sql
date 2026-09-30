-- One-time cleanup: removes the old event-listing fields from the Events page editor.
-- Events now live in the events table (Admin → View Events / Add Events), so these are unused.
-- Run in Supabase → SQL Editor. Safe to run more than once.

delete from public.cms_blocks where key in (
  'events/featured-next-up/featured-month',
  'events/featured-next-up/featured-day',
  'events/featured-next-up/featured-year',
  'events/featured-next-up/event-tag',
  'events/featured-next-up/event-title',
  'events/featured-next-up/event-desc'
);

-- Deleting the lists also deletes their items.
delete from public.cms_lists where key in (
  'events/placeholder-event-2/event-card',
  'events/featured-next-up/event-meta'
);
