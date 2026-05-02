-- supabase/migrations/2026_05_02_create_brand_kits.sql

create table brand_kits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  source_audit_id uuid references social_audits(id),
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'done', 'failed')),
  inputs jsonb not null,
  assets jsonb,
  error text,
  progress_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_kits_client_id_created_at_idx
  on brand_kits (client_id, created_at desc);

create trigger set_updated_at_brand_kits
  before update on brand_kits
  for each row execute function set_updated_at();

alter table brand_kits enable row level security;

create policy brand_kits_authenticated_select on brand_kits
  for select to authenticated using (true);

create policy brand_kits_service_role_all on brand_kits
  for all to service_role using (true) with check (true);
