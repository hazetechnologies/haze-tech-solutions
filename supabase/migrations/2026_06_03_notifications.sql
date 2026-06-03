-- supabase/migrations/2026_06_03_notifications.sql
-- Unified notifications table: client portal feed + admin center + event log.

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  audience     text not null check (audience in ('client','admin')),
  client_id    uuid references clients(id) on delete cascade,  -- null for admin-only events
  type         text not null,                                  -- e.g. 'invoice.paid'
  title        text not null,
  body         text not null,
  link         text,                                           -- in-app deep-link path
  payload      jsonb,
  email_status text check (email_status in ('sent','failed','skipped')),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_client_unread_idx on notifications (client_id, read_at) where audience = 'client';
create index notifications_admin_unread_idx  on notifications (read_at)            where audience = 'admin';
create index notifications_created_idx        on notifications (created_at desc);

alter table notifications enable row level security;

-- Client reads its own client-audience rows.
create policy notifications_client_read on notifications
  for select to authenticated using (
    audience = 'client' and client_id in (select id from clients where user_id = auth.uid())
  );
-- Client marks its own rows read.
create policy notifications_client_update on notifications
  for update to authenticated using (
    audience = 'client' and client_id in (select id from clients where user_id = auth.uid())
  );
-- Admin allowlist reads/updates everything (HTS is_admin() pattern, cf. automation_reports).
create policy notifications_admin_all on notifications
  for all using (is_admin()) with check (is_admin());

-- Track which status we've already notified on, so the watcher cron emits once.
alter table website_projects add column if not exists notified_status text;
alter table brand_kits       add column if not exists notified_status text;
