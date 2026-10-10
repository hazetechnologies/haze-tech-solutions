-- supabase/migrations/_manual_2026_10_08_website_delivery.sql
--
-- Website delivery: deploy → preview → approve.
--
-- RUN THIS BY HAND in the Supabase SQL editor as `postgres`. The Management API
-- is blocked by the auto-mode classifier in this environment, so migrations in
-- this repo are applied manually (same as _manual_2026_08_08_fix_admin_rls.sql).
--
-- Safe to re-run: every statement is guarded.
--
-- STEP 0 — see what you have now:
--   select status, count(*) from website_projects group by status;
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid = 'website_projects'::regclass;

begin;

-- ── 1. New statuses ────────────────────────────────────────────────────────
-- `done` is kept deliberately: existing rows carry it, and dropping it from
-- the CHECK would make this migration fail on any real database.
alter table website_projects
  drop constraint if exists website_projects_status_check;

alter table website_projects
  add constraint website_projects_status_check
  check (status in (
    'intake_pending',
    'intake_submitted',
    'generating',
    'done',              -- scaffold generated, not yet deployed (legacy + pre-deploy)
    'deploying',
    'preview_ready',
    'changes_requested',
    'approved',
    'live',
    'failed'
  ));

-- ── 2. Delivery columns ────────────────────────────────────────────────────
alter table website_projects add column if not exists vercel_project_id text;
alter table website_projects add column if not exists preview_url       text;
alter table website_projects add column if not exists live_url          text;
alter table website_projects add column if not exists approved_at       timestamptz;

-- ── 3. Revision history ────────────────────────────────────────────────────
-- A table rather than a column: a change request is a record with a lifecycle,
-- and overwriting the previous note loses the thread the operator works from.
create table if not exists website_revisions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references website_projects(id) on delete cascade,
  note         text not null,
  requested_by uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index if not exists website_revisions_project_id_idx
  on website_revisions(project_id);

alter table website_revisions enable row level security;

-- Clients read their own revision history. Mirrors the existing
-- clients_read_own_website_project policy on the parent table.
drop policy if exists "clients_read_own_website_revisions" on website_revisions;
create policy "clients_read_own_website_revisions" on website_revisions
  for select using (
    project_id in (
      select wp.id from website_projects wp
      where wp.client_id in (select id from clients where user_id = auth.uid())
    )
  );

-- Writes go through api/website.js with the service role, which bypasses RLS.
-- No insert/update policy is granted to clients on purpose: a change request
-- has to pass the status checks in ?action=request-changes, not be inserted
-- directly from the browser.

commit;

-- STEP 4 — verify:
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'website_projects_status_check';
--   select column_name from information_schema.columns
--     where table_name = 'website_projects'
--       and column_name in ('vercel_project_id','preview_url','live_url','approved_at');
--   select policyname from pg_policies where tablename = 'website_revisions';
--
-- Expect: the 10-value CHECK, four columns, one policy.
