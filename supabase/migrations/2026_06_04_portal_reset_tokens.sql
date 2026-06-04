-- SafeLinks-safe portal password reset / invite.
-- Supabase's one-time recovery links are pre-fetched and burned by email
-- security scanners (Outlook SafeLinks, etc.) before the user clicks. We instead
-- issue our own token to a /portal/reset page: loading the page (GET) consumes
-- nothing; only submitting the form (POST) sets the password and burns the token.
create table if not exists portal_reset_tokens (
  token       text primary key,
  user_id     uuid not null,
  email       text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists portal_reset_tokens_user_idx on portal_reset_tokens (user_id);

-- No policies: only the service role (api/* with the service key) touches this.
alter table portal_reset_tokens enable row level security;
