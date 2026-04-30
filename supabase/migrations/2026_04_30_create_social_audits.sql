-- supabase/migrations/2026_04_30_create_social_audits.sql
CREATE TABLE IF NOT EXISTS social_audits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid REFERENCES leads(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','fetching','analyzing','completed','failed')),
  progress_message  text,
  inputs            jsonb NOT NULL,
  raw_data          jsonb,
  report            jsonb,
  report_markdown   text,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS social_audits_lead_id_idx    ON social_audits(lead_id);
CREATE INDEX IF NOT EXISTS social_audits_status_idx     ON social_audits(status);
CREATE INDEX IF NOT EXISTS social_audits_created_at_idx ON social_audits(created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS social_audits_updated_at ON social_audits;
CREATE TRIGGER social_audits_updated_at
  BEFORE UPDATE ON social_audits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE social_audits ENABLE ROW LEVEL SECURITY;
-- No policies → no access for anon/authenticated. service_role bypasses RLS.
