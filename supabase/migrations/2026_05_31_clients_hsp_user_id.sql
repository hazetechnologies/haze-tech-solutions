-- 2026_05_31_clients_hsp_user_id.sql
-- Phase 1 of the haze-social-post integration.
--
-- 1. clients.hsp_user_id — when set, this client has a sub-tenant User in
--    haze-social-post (created via POST /api/v1/external/tenants). NULL =
--    social media not yet activated for the client.
-- 2. admin_settings entry for HSP_EXTERNAL_API_KEY — the per-integrator
--    bearer token that HTS uses to sign all calls to haze-social-post's
--    external API. Stored as a DB-first secret; production value is pasted
--    by an admin via /admin/secrets after running the seed script on
--    haze-social-post.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS hsp_user_id text UNIQUE;

INSERT INTO admin_settings (key, value)
VALUES ('HSP_EXTERNAL_API_KEY', '')
ON CONFLICT (key) DO NOTHING;
