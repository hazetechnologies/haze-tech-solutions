-- Stripe billing: link products + plans to Stripe SKUs, track customers per
-- client, and persist subscription state from webhooks.

-- Products and plans get Stripe IDs so we can route checkout to the right
-- price without a lookup table in code. Populated by scripts/sync-stripe-catalog.mjs
-- (idempotent — skips rows that already have IDs).
alter table products
  add column if not exists stripe_product_id text;

alter table subscription_plans
  add column if not exists stripe_price_id text;

-- One Stripe customer per client. Populated lazily on first checkout.
alter table clients
  add column if not exists stripe_customer_id text;

create unique index if not exists clients_stripe_customer_id_uniq
  on clients(stripe_customer_id) where stripe_customer_id is not null;

-- One-off invoices get linked to their Stripe Invoice once sent
alter table invoices
  add column if not exists stripe_invoice_id text,
  add column if not exists stripe_payment_link text;

-- Recurring subscriptions, mirrored from Stripe via webhooks
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  status text not null,                       -- Stripe statuses: active, trialing, past_due, canceled, incomplete, incomplete_expired, unpaid, paused
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_client_id_idx on subscriptions(client_id);
create index if not exists subscriptions_stripe_customer_id_idx on subscriptions(stripe_customer_id);

create trigger set_updated_at_subscriptions
  before update on subscriptions
  for each row execute function set_updated_at();

alter table subscriptions enable row level security;

-- Clients can read their own subscription
create policy subscriptions_client_owner_select on subscriptions
  for select to authenticated
  using (
    client_id in (select id from clients where user_id = auth.uid())
  );

-- Service role does everything (admin app + webhooks run as service role)
create policy subscriptions_service_role_all on subscriptions
  for all to service_role using (true) with check (true);
