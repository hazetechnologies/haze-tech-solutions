-- ─────────────────────────────────────────────────────────────
-- Haze Tech Solutions — AI Automation Fields + Reports
-- Run this in: Supabase Dashboard -> SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Add AI Automation intake fields to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS goals text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS repetitive_task text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS payment_process text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vendor_process text;

-- Automation reports (AI-generated plans, admin-only)
CREATE TABLE IF NOT EXISTS automation_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  report text NOT NULL,
  workflows_suggested jsonb,
  estimated_roi text,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE automation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_automation_reports" ON automation_reports FOR ALL
  USING (is_admin());
