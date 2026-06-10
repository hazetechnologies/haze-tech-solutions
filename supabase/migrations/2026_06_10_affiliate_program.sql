-- ─────────────────────────────────────────────────────────────
-- Haze Tech Solutions — Affiliate / Referral Program (v1)
-- Apply via Supabase Management API (no automated runner).
-- ─────────────────────────────────────────────────────────────

-- ── Affiliates ──────────────────────────────────────────────
create table if not exists affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,                       -- Supabase auth user (affiliate login)
  code text not null,                                 -- referral code (uppercase base32-ish)
  name text not null,
  email text not null,
  status text not null default 'active',              -- pending | active | suspended
  payout_method text,                                 -- free-form v1 (e.g. "PayPal")
  payout_details jsonb,                               -- free-form v1 (e.g. { "email": "..." })
  upline_affiliate_id uuid references affiliates(id), -- RESERVED for downline (unused in v1)
  created_at timestamptz not null default now()
);
-- Case-insensitive uniqueness on the code (prevents near-dupes + case-folded lookups)
create unique index if not exists affiliates_code_lower_uniq on affiliates (lower(code));

-- ── Commission rules (admin-configurable, not hardcoded) ────
create table if not exists commission_rules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  event_type text not null,                           -- first_payment | recurring_payment (reserved)
  payout_kind text not null,                          -- percent | amount | points
  percent numeric,                                    -- e.g. 10.00
  amount_cents integer,                               -- for flat payouts
  min_payout_cents integer,                           -- floor (e.g. 5000 = $50)
  cap_cents integer,                                  -- null = no cap
  is_recurring boolean not null default false,        -- reserved for residual
  recurring_months integer,                           -- reserved
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Commissions (the ledger) ────────────────────────────────
create table if not exists commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  rule_id uuid references commission_rules(id),
  client_id uuid references clients(id) on delete set null,
  source_table text,                                  -- 'invoices' | 'subscriptions'
  source_id text,                                     -- stripe invoice / subscription id
  event_key text not null unique,                     -- idempotency: exactly-once award
  base_amount_cents integer,                          -- payment the commission was computed from
  amount_cents integer not null,                      -- commission owed
  status text not null default 'pending',             -- pending | approved | paid | void
  approved_at timestamptz,
  paid_at timestamptz,
  payout_ref text,
  created_at timestamptz not null default now()
);
create index if not exists commissions_affiliate_id_idx on commissions(affiliate_id);
create index if not exists commissions_status_idx on commissions(status);

-- ── Attribution columns on existing tables ──────────────────
alter table leads   add column if not exists referred_by_affiliate_id uuid references affiliates(id);
alter table leads   add column if not exists ref_code_raw text;
alter table clients add column if not exists referred_by_affiliate_id uuid references affiliates(id);
create index if not exists leads_referred_by_idx   on leads(referred_by_affiliate_id);
create index if not exists clients_referred_by_idx on clients(referred_by_affiliate_id);

-- ── CRITICAL: fix is_admin() so affiliates are NOT treated as admins ──
-- is_admin() was "has no clients row" → an affiliate auth user (no clients
-- row) would silently pass every admin_all_* RLS policy. Exclude affiliates too.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (select 1 from clients    where user_id = auth.uid())
     and not exists (select 1 from affiliates where user_id = auth.uid());
$$;

-- Helper for affiliate-scoped RLS (defense-in-depth; endpoints scope by session too)
create or replace function current_affiliate_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from affiliates where user_id = auth.uid();
$$;

-- ── RLS ─────────────────────────────────────────────────────
alter table affiliates      enable row level security;
alter table commission_rules enable row level security;
alter table commissions     enable row level security;

-- affiliates: admin full; affiliate reads only its own row; service role full.
drop policy if exists admin_all_affiliates       on affiliates;
drop policy if exists affiliate_self_select       on affiliates;
drop policy if exists affiliates_service_role_all on affiliates;
create policy admin_all_affiliates       on affiliates for all    using (is_admin());
create policy affiliate_self_select       on affiliates for select using (user_id = auth.uid());
create policy affiliates_service_role_all on affiliates for all    using (auth.role() = 'service_role');

-- commission_rules: admin + service role only (internal).
drop policy if exists admin_all_commission_rules       on commission_rules;
drop policy if exists commission_rules_service_role_all on commission_rules;
create policy admin_all_commission_rules       on commission_rules for all using (is_admin());
create policy commission_rules_service_role_all on commission_rules for all using (auth.role() = 'service_role');

-- commissions: admin full; affiliate reads only its own; service role full.
drop policy if exists admin_all_commissions             on commissions;
drop policy if exists commissions_affiliate_owner_select on commissions;
drop policy if exists commissions_service_role_all        on commissions;
create policy admin_all_commissions             on commissions for all    using (is_admin());
create policy commissions_affiliate_owner_select on commissions for select using (affiliate_id = current_affiliate_id());
create policy commissions_service_role_all        on commissions for all    using (auth.role() = 'service_role');

-- ── Seed the default rule (10% of first paid invoice, min $50, no cap) ──
insert into commission_rules (slug, event_type, payout_kind, percent, min_payout_cents, cap_cents, is_active, is_recurring)
values ('first-paid-invoice', 'first_payment', 'percent', 10.00, 5000, null, true, false)
on conflict (slug) do nothing;

-- Reserved residual rule, disabled (enable + wire later, no migration needed)
insert into commission_rules (slug, event_type, payout_kind, percent, is_active, is_recurring, recurring_months)
values ('recurring-residual', 'recurring_payment', 'percent', 5.00, false, true, 6)
on conflict (slug) do nothing;
