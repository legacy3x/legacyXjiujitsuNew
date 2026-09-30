-- Legacy X events & registrations — run in Supabase → SQL Editor after setup.sql.
-- Safe to run more than once.

-- ── Tables ──

create table if not exists public.events (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  category               text not null default 'academy'
                           check (category in ('competition', 'seminar', 'open-mat', 'academy')),
  event_date             date,                    -- null = date TBA
  start_time             time,
  end_time               time,
  location               text not null default '27 Bysham Park Drive (Unit 1), Woodstock, ON',
  description            text not null default '',
  photo_url              text,
  cost_cents             integer not null default 0 check (cost_cents >= 0),
  capacity               integer check (capacity is null or capacity > 0),  -- null = unlimited
  registration_opens_at  timestamptz,
  registration_closes_at timestamptz,
  attendee_instructions  text not null default '',
  published              boolean not null default false,
  registration_enabled   boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.event_registrations (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events (id) on delete cascade,
  first_name         text not null,
  last_name          text not null,
  email              text not null,
  phone              text not null,
  quantity           integer not null check (quantity between 1 and 20),
  amount_cents       integer not null default 0,
  payment_method     text not null check (payment_method in ('free', 'etransfer', 'stripe')),
  status             text not null
                       check (status in ('pending_payment', 'awaiting_verification', 'confirmed', 'cancelled')),
  etransfer_code     text,
  stripe_session_id  text,
  waiver_accepted_at timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists event_registrations_event_idx on public.event_registrations (event_id, status);
create index if not exists event_registrations_stripe_idx on public.event_registrations (stripe_session_id);

create table if not exists public.event_attendees (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.event_registrations (id) on delete cascade,
  position        integer not null default 1,
  full_name       text not null,
  date_of_birth   date not null
);
create index if not exists event_attendees_registration_idx on public.event_attendees (registration_id);

-- ── Capacity ──

-- Spots held: confirmed, waiting for e-Transfer check, or mid-checkout with Stripe
-- (Stripe checkouts expire after 30 minutes, so older pending ones no longer hold a spot).
create or replace function public.event_spots_taken(p_event uuid)
returns integer
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(quantity), 0)::integer
  from public.event_registrations
  where event_id = p_event
    and (status in ('confirmed', 'awaiting_verification')
         or (status = 'pending_payment' and created_at > now() - interval '35 minutes'));
$$;

-- open | not_open | closed | sold_out
create or replace function public.event_registration_state(e public.events)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when not e.registration_enabled then 'closed'
    when e.registration_opens_at is not null and now() < e.registration_opens_at then 'not_open'
    when e.registration_closes_at is not null and now() > e.registration_closes_at then 'closed'
    when e.event_date is not null and e.event_date < (now() at time zone 'America/Toronto')::date then 'closed'
    when e.capacity is not null and public.event_spots_taken(e.id) >= e.capacity then 'sold_out'
    else 'open'
  end;
$$;

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
         case when e.capacity is null then null else greatest(e.capacity - public.event_spots_taken(e.id), 0) end,
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
         case when e.capacity is null then null else greatest(e.capacity - public.event_spots_taken(e.id), 0) end,
         public.event_registration_state(e), e.registration_opens_at, e.registration_closes_at,
         e.attendee_instructions
  from public.events e
  where e.id = p_id and e.published;
$$;

-- ── Registration (called by the Netlify function with the service key) ──

create or replace function public.create_registration(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  e        public.events;
  qty      integer := jsonb_array_length(coalesce(p -> 'attendees', '[]'::jsonb));
  amount   integer;
  method   text;
  st       text;
  reg_id   uuid;
begin
  select * into e from public.events where id = (p ->> 'event_id')::uuid for update;
  if not found or not e.published then raise exception 'EVENT_NOT_FOUND'; end if;

  if qty < 1 or qty > 20 then raise exception 'INVALID_QUANTITY'; end if;
  if coalesce(p ->> 'waiver_accepted', 'false') <> 'true' then raise exception 'WAIVER_REQUIRED'; end if;

  case public.event_registration_state(e)
    when 'not_open' then raise exception 'REGISTRATION_NOT_OPEN';
    when 'closed' then raise exception 'REGISTRATION_CLOSED';
    else null;
  end case;
  if e.capacity is not null and public.event_spots_taken(e.id) + qty > e.capacity then
    raise exception 'NOT_ENOUGH_SPOTS';
  end if;

  amount := e.cost_cents * qty;
  method := case when amount = 0 then 'free' else p ->> 'payment_method' end;
  if method not in ('free', 'etransfer', 'stripe') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if method = 'etransfer' and coalesce(btrim(p ->> 'etransfer_code'), '') = '' then
    raise exception 'ETRANSFER_CODE_REQUIRED';
  end if;
  st := case method when 'free' then 'confirmed' when 'etransfer' then 'awaiting_verification' else 'pending_payment' end;

  insert into public.event_registrations
    (event_id, first_name, last_name, email, phone, quantity, amount_cents, payment_method, status,
     etransfer_code, waiver_accepted_at)
  values
    (e.id, btrim(p ->> 'first_name'), btrim(p ->> 'last_name'), lower(btrim(p ->> 'email')), btrim(p ->> 'phone'),
     qty, amount, method, st, nullif(btrim(p ->> 'etransfer_code'), ''), now())
  returning id into reg_id;

  insert into public.event_attendees (registration_id, position, full_name, date_of_birth)
  select reg_id, a.ord, btrim(a.v ->> 'full_name'), (a.v ->> 'date_of_birth')::date
  from jsonb_array_elements(p -> 'attendees') with ordinality as a(v, ord);

  return jsonb_build_object(
    'id', reg_id, 'status', st, 'payment_method', method, 'amount_cents', amount,
    'quantity', qty, 'event_title', e.title, 'unit_cents', e.cost_cents,
    'attendee_instructions', e.attendee_instructions
  );
end;
$$;

-- ── Access rules ──

alter table public.events              enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_attendees     enable row level security;

drop policy if exists "events public read" on public.events;
create policy "events public read" on public.events for select using (published or public.is_cms_admin());
drop policy if exists "events admin write" on public.events;
create policy "events admin write" on public.events for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());

drop policy if exists "registrations admin" on public.event_registrations;
create policy "registrations admin" on public.event_registrations for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());
drop policy if exists "attendees admin" on public.event_attendees;
create policy "attendees admin" on public.event_attendees for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());

grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, update, delete on public.event_registrations, public.event_attendees to authenticated;

revoke all on function public.create_registration(jsonb) from public, anon, authenticated;
grant execute on function public.create_registration(jsonb) to service_role;
grant execute on function public.public_events() to anon, authenticated;
grant execute on function public.public_event(uuid) to anon, authenticated;
grant execute on function public.event_spots_taken(uuid) to anon, authenticated;
grant execute on function public.event_registration_state(public.events) to anon, authenticated;

-- ── Event photos (public bucket; only admins can upload) ──

insert into storage.buckets (id, name, public) values ('event-photos', 'event-photos', true)
on conflict (id) do nothing;

drop policy if exists "event photos admin insert" on storage.objects;
create policy "event photos admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and public.is_cms_admin());
drop policy if exists "event photos admin update" on storage.objects;
create policy "event photos admin update" on storage.objects for update to authenticated
  using (bucket_id = 'event-photos' and public.is_cms_admin());
drop policy if exists "event photos admin delete" on storage.objects;
create policy "event photos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos' and public.is_cms_admin());

-- ── The events that were on the site before ──

insert into public.events (id, title, category, event_date, location, description, published, registration_enabled)
values
  ('00000000-0000-4000-8000-000000000001', 'Something Big Is Coming — Nogi Event', 'competition', '2026-10-17',
   'Location TBA',
   'Legacy X''s first major Nogi event is coming October 17, 2026. More details including time, location, and registration information will be announced soon. Save the date.',
   true, false),
  ('00000000-0000-4000-8000-000000000002', 'Belt Promotion Ceremony', 'academy', null,
   'Legacy X Jiu-Jitsu — Woodstock, ON',
   'Legacy X''s first belt promotion ceremony. Dates to be confirmed. All members and family are welcome to attend and celebrate our students'' progress.',
   true, false),
  ('00000000-0000-4000-8000-000000000003', 'Legacy X Open Mat', 'open-mat', null,
   'Legacy X Jiu-Jitsu — Woodstock, ON',
   'An open mat for Legacy X members and invited guests. All levels welcome. More details coming soon.',
   true, false)
on conflict (id) do nothing;
