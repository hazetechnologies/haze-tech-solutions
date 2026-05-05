-- supabase/migrations/2026_05_05_create_website_projects.sql

create table website_projects (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  status           text not null default 'intake_pending',
  template_id      text,
  inputs           jsonb,
  ai_content       jsonb,
  repo_name        text,
  repo_url         text,
  error            text,
  progress_message text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index website_projects_client_id_idx on website_projects(client_id);

alter table website_projects enable row level security;

-- Clients can read their own row (used by portal)
create policy "clients_read_own_website_project" on website_projects
  for select using (
    client_id in (select id from clients where user_id = auth.uid())
  );

-- Service role bypasses RLS automatically; no policy needed for admin/edge fn
