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

-- One locked step for a sign-up (Codex review 2026-11-12): the per-IP limit, the
-- same-number-within-a-day check and the insert run under one advisory lock, so
-- concurrent requests can't all pass the checks and insert. Returns 'stored',
-- 'duplicate' or 'rate_limited'. service_role only.
create or replace function public.sms_optin_record(
  p_name text, p_phone text, p_consent_text text, p_consent_version text, p_ip text, p_user_agent text, p_ip_limit int
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('hts.sms_optin', 0));
  if p_ip is not null and (select count(*) from public.sms_consents
      where ip = p_ip and created_at > now() - interval '1 hour') >= p_ip_limit then
    return 'rate_limited';
  end if;
  if exists (select 1 from public.sms_consents
      where phone = p_phone and revoked_at is null and created_at > now() - interval '1 day') then
    return 'duplicate';
  end if;
  insert into public.sms_consents (name, phone, consent_text, consent_version, source, ip, user_agent)
  values (p_name, p_phone, p_consent_text, p_consent_version, 'web_form', p_ip, p_user_agent);
  return 'stored';
end $$;
revoke all on function public.sms_optin_record(text, text, text, text, text, text, int) from public, anon, authenticated;
grant execute on function public.sms_optin_record(text, text, text, text, text, text, int) to service_role;
