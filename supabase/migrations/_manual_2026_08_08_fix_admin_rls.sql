-- ============================================================================
-- MANUAL RLS remediation — run in Supabase SQL editor after reviewing STEP 0.
-- Project: ioxpfvxcsclgmwyslxjj (haze-tech-solutions)
--
-- Fixes (all pre-existing):
--   1. is_admin() returned TRUE for anon (auth.uid() null) and for ANY tenant-less
--      authenticated account → both are treated as admin.
--   2. notifications / chat_messages / email_autoresponses admin policies lacked
--      TO authenticated → anon (public key) could satisfy is_admin().
--   3. brand_kits_authenticated_select USING (true) → every authenticated client
--      could read every tenant's kit.
--
-- Behavior-preserving: STEP 1 seeds an explicit admin allowlist from the CURRENT
-- admin population (today's tenant-less auth users), so nobody who is an admin
-- today loses access. The server API layer (requireAdmin + service role) is
-- unaffected either way. Filename is underscore-prefixed so `supabase db push`
-- does NOT auto-apply it — this is applied by hand.
-- ============================================================================

-- ── STEP 0 — INSPECT FIRST (read-only). REVIEW the seeded-admin list below;
--            if it contains an email that should NOT be an admin, delete that
--            row from app_admins after STEP 1 (it is an admin TODAY too). ──
-- Current is_admin() definition:
--   select pg_get_functiondef(p.oid) from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname='is_admin';
-- Accounts that are admins TODAY (and will be seeded):
--   select u.id, u.email from auth.users u
--   where not exists (select 1 from public.clients    c where c.user_id = u.id)
--     and not exists (select 1 from public.affiliates a where a.user_id = u.id)
--   order by u.email;

begin;

-- ── STEP 1 — explicit admin allowlist + repoint is_admin() ──
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policies → anon/authenticated cannot read the admin list directly.
-- is_admin() is SECURITY DEFINER (runs as owner) so it still reads it.

-- Seed with the CURRENT admin population so behavior is preserved.
insert into public.app_admins (user_id, note)
select u.id, 'seeded from tenant-less on 2026-08-08'
from auth.users u
where not exists (select 1 from public.clients    c where c.user_id = u.id)
  and not exists (select 1 from public.affiliates a where a.user_id = u.id)
on conflict (user_id) do nothing;

-- Repoint is_admin() at the allowlist. anon (auth.uid() null) now matches no row
-- → false; a future tenant-less signup is NOT auto-admin.
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
-- CREATE OR REPLACE PRESERVES the function's prior owner. Pin the owner (and the
-- table owner) to postgres so the SECURITY DEFINER call runs as the app_admins
-- owner, which is exempt from its own RLS. Without this, a legacy owner + the
-- policy-less RLS on app_admins would make is_admin() return FALSE for everyone
-- and lock admins out of every is_admin()-gated table. (Run as postgres — the
-- default in the Supabase SQL editor.)
alter table    public.app_admins owner to postgres;
alter function public.is_admin()  owner to postgres;

-- ── STEP 2 — scope the admin policies to the authenticated role (defense in
--            depth; STEP 1 alone already closes anon since is_admin()=false). ──
drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all on public.notifications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_read_chat_messages on public.chat_messages;
create policy admin_read_chat_messages on public.chat_messages
  for select to authenticated using (public.is_admin());

drop policy if exists admin_all_autoresponses on public.email_autoresponses;
create policy admin_all_autoresponses on public.email_autoresponses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── STEP 3 — brand_kits: remove ANY blanket/legacy read policy. DRIFT-PROOF —
--            instead of dropping by a name that may have drifted (leaving a
--            renamed USING(true) policy OR'd in and still leaking every tenant's
--            kit), drop EVERY existing brand_kits policy, then recreate exactly
--            the intended three. ──
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'brand_kits'
  loop
    execute format('drop policy if exists %I on public.brand_kits', pol.policyname);
  end loop;
end $$;

create policy brand_kits_service_role_all on public.brand_kits
  for all to service_role using (true) with check (true);
create policy brand_kits_client_owner_select on public.brand_kits
  for select to authenticated
  using (client_id in (select id from public.clients where user_id = auth.uid()));
create policy brand_kits_admin_select on public.brand_kits
  for select to authenticated using (public.is_admin());

commit;

-- ── STEP 4 — VERIFY (after commit) ──
--   select count(*) as admins from public.app_admins;
--   select tablename, policyname, roles, cmd from pg_policies
--   where schemaname='public'
--     and tablename in ('leads','notifications','chat_messages','email_autoresponses','brand_kits')
--   order by 1,2;
-- Then: log into the ADMIN app and the PORTAL and confirm the dashboards,
-- notifications bell, conversations, and brand kits still load.
