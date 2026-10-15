-- Registration emails ("pending approval" for e-Transfers, "approved" once confirmed).
-- Run once in Supabase → SQL Editor. Safe to run more than once.
-- Records when each email went out, so nobody gets the same email twice.
alter table public.event_registrations add column if not exists pending_emailed_at  timestamptz;
alter table public.event_registrations add column if not exists approved_emailed_at timestamptz;
