-- Text-message sign-ups from hazetechsolutions.com/sms-signup (10DLC opt-in record).
-- One row per sign-up, append-only: the proof of consent is the exact wording
-- the person agreed to (consent_text, the server's copy from src/lib/smsProgram.js),
-- its version, and when and from where they agreed.
--
-- RLS on with NO policies: only the service role (api/website.js?action=sms-optin)
-- can read or write. Phone numbers are not readable through the anon key, and
-- not through a signed-in portal client's token either.
create table if not exists public.sms_consents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  phone text not null check (phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  consent_text text not null,
  consent_version text not null,
  source text not null default 'web_form' check (source in ('web_form')),
  ip text,
  user_agent text,
  revoked_at timestamptz
);

create index if not exists sms_consents_phone_idx on public.sms_consents (phone);
create index if not exists sms_consents_ip_created_idx on public.sms_consents (ip, created_at);

alter table public.sms_consents enable row level security;
revoke all on public.sms_consents from anon, authenticated;
