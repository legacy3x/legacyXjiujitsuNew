-- Legacy X store (Printful products, orders) — run in Supabase → SQL Editor after setup.sql.
-- Safe to run more than once.

-- ── Products pulled from Printful ──
-- Synced by the admin ("Sync from Printful"). Only rows with live = true show on the website.
create table if not exists public.store_products (
  id                  uuid primary key default gen_random_uuid(),
  printful_store_id   bigint not null,
  printful_store_name text not null default '',
  printful_product_id bigint not null,
  name                text not null,
  description         text not null default '',   -- written in the admin (Printful has none)
  thumbnail_url       text,
  -- [{ id, catalog_variant_id, name, size, color, price_cents, currency, image, available }]
  variants            jsonb not null default '[]'::jsonb,
  currency            text not null default 'CAD',
  min_price_cents     integer not null default 0,
  max_price_cents     integer not null default 0,
  live                boolean not null default false,
  sort                integer not null default 0,
  synced_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (printful_store_id, printful_product_id)
);
-- Extra photos added in the admin, shown on the product page: ["https://…", …]
alter table public.store_products add column if not exists photos jsonb not null default '[]'::jsonb;
create index if not exists store_products_live_idx on public.store_products (live, sort);

-- ── Orders placed on the website ──
create table if not exists public.store_orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique,
  payment_status    text not null default 'pending'
                      check (payment_status in ('pending', 'paid', 'cancelled')),
  -- not_sent | draft | pending | inprocess | partial | fulfilled | canceled | failed | onhold | error …
  fulfillment_status text not null default 'not_sent',
  name              text not null,
  email             text not null,
  phone             text not null default '',
  recipient         jsonb not null,               -- shipping address as sent to Printful
  -- [{ product_id, variant_id, printful_store_id, name, variant_name, quantity, unit_cents, image }]
  items             jsonb not null,
  currency          text not null,
  subtotal_cents    integer not null,
  shipping_cents    integer not null default 0,
  tax_cents         integer not null default 0,
  total_cents       integer not null,
  shipping_name     text not null default '',
  shipping_rates    jsonb not null default '{}'::jsonb,   -- { "<printful store id>": "STANDARD" }
  stripe_session_id text,
  -- [{ store_id, order_id, status, shipments: [{ carrier, tracking_number, tracking_url }], error }]
  printful_orders   jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists store_orders_created_idx on public.store_orders (created_at desc);
create index if not exists store_orders_stripe_idx on public.store_orders (stripe_session_id);

-- ── Settings (one row) ──
create table if not exists public.store_settings (
  id                  integer primary key default 1 check (id = 1),
  auto_confirm        boolean not null default false,     -- false: orders wait in Printful as drafts
  shipping_mode       text not null default 'printful' check (shipping_mode in ('printful', 'free', 'flat')),
  flat_shipping_cents integer not null default 0,
  tax_percent         numeric(5, 2) not null default 0,   -- 0 = no tax line
  tax_label           text not null default 'HST',
  countries           text[],                             -- null = ship worldwide; else ISO codes, e.g. {CA,US}
  updated_at          timestamptz not null default now()
);
insert into public.store_settings (id) values (1) on conflict (id) do nothing;

-- ── Access rules ──
alter table public.store_products enable row level security;
alter table public.store_orders   enable row level security;
alter table public.store_settings enable row level security;

-- Anyone can see live products; admins see and edit everything.
drop policy if exists "store products read" on public.store_products;
create policy "store products read" on public.store_products for select using (live or public.is_cms_admin());
drop policy if exists "store products admin" on public.store_products;
create policy "store products admin" on public.store_products for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());

-- Orders and settings are admin-only (the website's functions use the service key).
drop policy if exists "store orders admin" on public.store_orders;
create policy "store orders admin" on public.store_orders for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());
drop policy if exists "store settings admin" on public.store_settings;
create policy "store settings admin" on public.store_settings for all to authenticated
  using (public.is_cms_admin()) with check (public.is_cms_admin());

grant select on public.store_products to anon, authenticated;
grant update, delete on public.store_products to authenticated;
grant select, update on public.store_orders, public.store_settings to authenticated;
