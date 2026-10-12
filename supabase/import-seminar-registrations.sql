-- One-off import: people who registered and paid elsewhere for the seminar
-- "Dangerous From Bottom — NoGi Half Guard Attack Series". Run once in Supabase → SQL Editor.
-- Safe to run more than once (anyone already on the event's list with the same email is skipped).

-- Imported people have no date of birth or signed waiver on this website, so those may be empty.
-- (Sign-ups on the website still have to give both.)
alter table public.event_attendees alter column date_of_birth drop not null;
alter table public.event_registrations alter column waiver_accepted_at drop not null;

do $$
declare
  ev    uuid;
  found integer;
  reg   uuid;
  p     record;
begin
  select count(*) into found from public.events where title ilike 'Dangerous From Bottom%';
  if found <> 1 then
    raise exception 'Expected exactly one event starting with "Dangerous From Bottom", found %.', found;
  end if;
  select id into ev from public.events where title ilike 'Dangerous From Bottom%';

  for p in
    select * from (values
      -- first name, last name, email, phone, registered, paid (cents), method, people
      ('Darryl',  'Walker',       'trip7walker@gmail.com',         '5197779255', date '2026-10-11', 2500, 'stripe',    1),
      ('Derek',   'Vankoughnett', 'derekvankoughnett@hotmail.com', '',           date '2026-10-09', 2500, 'stripe',    1),
      ('Brian',   'Figueiredo',   'disgustmusic@yahoo.ca',         '5192129451', date '2026-09-30', 5000, 'stripe',    2),
      ('Matthew', 'Gorecki',      'mattgorecki89@hotmail.com',     '2265040080', date '2026-09-26', 5000, 'stripe',    2),
      ('Jenn',    'Afonso',       'jennafonso@gmail.com',          '5195918079', date '2026-09-24', 2500, 'etransfer', 1)
    ) as t (first_name, last_name, email, phone, registered, cents, method, people)
  loop
    continue when exists (
      select 1 from public.event_registrations r
      where r.event_id = ev and lower(r.email) = lower(p.email) and r.status <> 'cancelled');

    insert into public.event_registrations
      (event_id, first_name, last_name, email, phone, quantity, amount_cents, payment_method, status, waiver_accepted_at, created_at)
    values
      (ev, p.first_name, p.last_name, p.email, p.phone, p.people, p.cents, p.method, 'confirmed', null,
       (p.registered + time '12:00') at time zone 'America/Toronto')
    returning id into reg;

    insert into public.event_attendees (registration_id, position, full_name, date_of_birth)
    select reg, n,
           case when n = 1 then p.first_name || ' ' || p.last_name
                else 'Guest of ' || p.first_name || ' ' || p.last_name end,
           null
    from generate_series(1, p.people) as n;
  end loop;
end $$;

-- Check: should list 5 registrations and 7 people for the seminar.
select e.title, count(*) as registrations, sum(r.quantity) as people, sum(r.amount_cents) / 100.0 as paid
from public.event_registrations r join public.events e on e.id = r.event_id
where e.title ilike 'Dangerous From Bottom%' and r.status = 'confirmed'
group by e.title;
