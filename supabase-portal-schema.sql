-- ─────────────────────────────────────────────────────────────
-- Haze Tech Solutions — Client Portal Schema
-- Run this entire file in: Supabase Dashboard -> SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Helper function: checks if current user is admin (not a client)
-- Uses SECURITY DEFINER to bypass RLS on the clients table
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM clients WHERE user_id = auth.uid()
  );
$$;

-- Clients (linked to Supabase auth users)
CREATE TABLE IF NOT EXISTS clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  company text,
  phone text,
  created_at timestamptz DEFAULT now()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  service_type text,
  status text DEFAULT 'not_started',
  start_date date,
  due_date date,
  progress integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Milestones
CREATE TABLE IF NOT EXISTS milestones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending',
  due_date date,
  display_order integer DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Deliverables
CREATE TABLE IF NOT EXISTS deliverables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  file_url text,
  file_type text DEFAULT 'link',
  created_at timestamptz DEFAULT now()
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  amount decimal(10,2) NOT NULL,
  status text DEFAULT 'pending',
  due_date date,
  paid_date date,
  description text,
  created_at timestamptz DEFAULT now()
);

-- ── Row Level Security ──────────────────────────────────────

ALTER TABLE clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices     ENABLE ROW LEVEL SECURITY;

-- Clients table
CREATE POLICY "admin_all_clients" ON clients FOR ALL
  USING (is_admin());
CREATE POLICY "client_read_own" ON clients FOR SELECT
  USING (user_id = auth.uid());

-- Projects table
CREATE POLICY "admin_all_projects" ON projects FOR ALL
  USING (is_admin());
CREATE POLICY "client_read_own_projects" ON projects FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE user_id = auth.uid() AND id = client_id));

-- Milestones table
CREATE POLICY "admin_all_milestones" ON milestones FOR ALL
  USING (is_admin());
CREATE POLICY "client_read_own_milestones" ON milestones FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects p
    JOIN clients c ON c.id = p.client_id
    WHERE p.id = project_id AND c.user_id = auth.uid()
  ));

-- Deliverables table
CREATE POLICY "admin_all_deliverables" ON deliverables FOR ALL
  USING (is_admin());
CREATE POLICY "client_read_own_deliverables" ON deliverables FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects p
    JOIN clients c ON c.id = p.client_id
    WHERE p.id = project_id AND c.user_id = auth.uid()
  ));

-- Invoices table
CREATE POLICY "admin_all_invoices" ON invoices FOR ALL
  USING (is_admin());
CREATE POLICY "client_read_own_invoices" ON invoices FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE user_id = auth.uid() AND id = client_id));
