-- supabase/migrations/2026_05_05_b_add_website_projects_status_check.sql

alter table website_projects
  add constraint website_projects_status_check
  check (status in ('intake_pending','intake_submitted','generating','done','failed'));
