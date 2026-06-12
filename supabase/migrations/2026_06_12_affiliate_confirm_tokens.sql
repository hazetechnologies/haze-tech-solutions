-- ─────────────────────────────────────────────────────────────
-- Affiliate email confirmation (SafeLinks-safe, our own — not Supabase's)
-- Applied via Supabase Management API.
-- ─────────────────────────────────────────────────────────────
create table if not exists affiliate_confirm_tokens (
  token text primary key,
  user_id uuid not null,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_confirm_tokens_user_idx on affiliate_confirm_tokens(user_id);
-- RLS on, no policies → only the service role (edge/api) can touch it.
alter table affiliate_confirm_tokens enable row level security;
