-- Email Auto-Responder Agent
-- Adds: leads.auto_replied_at (cron claims new leads for a one-time auto-reply)
-- and email_autoresponses (activity log + inbound dedup).

-- 1. Lead auto-reply claim column.
alter table leads add column if not exists auto_replied_at timestamptz;

-- Backfill so the cron never blasts pre-existing leads. New leads insert with
-- NULL -> eligible; everything that exists today is marked done.
update leads set auto_replied_at = now() where auto_replied_at is null;

-- 2. Auto-response log / inbound dedup.
-- NOTE: PII-bearing (to_email + subject of real inbound mail). Admin-only via
-- RLS below; apply a retention policy if needed. Email bodies are NOT stored.
create table if not exists email_autoresponses (
  id           uuid primary key default gen_random_uuid(),
  source       text not null check (source in ('inbound','lead')),
  to_email     text,
  subject      text,
  message_id   text,                  -- inbound Message-ID, for dedup
  lead_id      uuid references leads(id) on delete set null,
  ai_answered  boolean default false, -- true=ANSWER, false=DEFER/IGNORE
  reply_status text check (reply_status in ('sent','failed','skipped','deferred')),
  notes        text,                  -- skip reason / classification, e.g. 'ignore:spam'
  created_at   timestamptz not null default now()
);

-- One log row per inbound Message-ID: makes inbound processing idempotent and
-- lets later cron runs cheaply skip already-handled mail (even spam left unread).
create unique index if not exists email_autoresponses_msgid_uniq
  on email_autoresponses (message_id) where source = 'inbound';

create index if not exists email_autoresponses_created_idx
  on email_autoresponses (created_at desc);

alter table email_autoresponses enable row level security;

-- Admin-only (is_admin() = authenticated user who is NOT a client). Writes come
-- from the service role, which bypasses RLS; this policy gates admin reads.
drop policy if exists "admin_all_autoresponses" on email_autoresponses;
create policy "admin_all_autoresponses" on email_autoresponses for all using (is_admin());
