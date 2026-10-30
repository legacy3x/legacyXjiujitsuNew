-- Lets admin choose, per event, whether "N spots left" shows on the website.
-- Run once in Supabase → SQL Editor. Safe to run more than once.
alter table public.events add column if not exists show_spots_left boolean not null default true;

-- ── Public read (website) ──

create or replace function public.public_events()
returns table (
  id uuid, title text, category text, event_date date, start_time time, end_time time,
  location text, description text, photo_url text, cost_cents integer, capacity integer,
  spots_left integer, registration_state text, registration_opens_at timestamptz,
  registration_closes_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.title, e.category, e.event_date, e.start_time, e.end_time, e.location, e.description,
         e.photo_url, e.cost_cents, e.capacity,
         case when e.capacity is null or not e.show_spots_left then null else greatest(e.capacity - public.event_spots_taken(e.id), 0) end,
         public.event_registration_state(e), e.registration_opens_at, e.registration_closes_at
  from public.events e
  where e.published
    and (e.event_date is null or e.event_date >= (now() at time zone 'America/Toronto')::date)
  order by e.event_date nulls last, e.start_time nulls last, e.created_at;
$$;

create or replace function public.public_event(p_id uuid)
returns table (
  id uuid, title text, category text, event_date date, start_time time, end_time time,
  location text, description text, photo_url text, cost_cents integer, capacity integer,
  spots_left integer, registration_state text, registration_opens_at timestamptz,
  registration_closes_at timestamptz, attendee_instructions text
)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.title, e.category, e.event_date, e.start_time, e.end_time, e.location, e.description,
         e.photo_url, e.cost_cents, e.capacity,
         case when e.capacity is null or not e.show_spots_left then null else greatest(e.capacity - public.event_spots_taken(e.id), 0) end,
         public.event_registration_state(e), e.registration_opens_at, e.registration_closes_at,
         e.attendee_instructions
  from public.events e
  where e.id = p_id and e.published;
$$;
