-- ─────────────────────────────────────────────────────────────
-- Haze Tech Solutions — Products & Subscription Plans
-- Run this in: Supabase Dashboard -> SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Products / Services offered
CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  base_price decimal(10,2),
  active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Subscription / billing plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  billing_cycle text DEFAULT 'monthly',
  duration_months integer,
  discount_percent decimal(5,2) DEFAULT 0,
  active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_all_products" ON products FOR ALL
  USING (is_admin());
CREATE POLICY "admin_all_plans" ON subscription_plans FOR ALL
  USING (is_admin());

-- Clients can read active products/plans (for portal display)
CREATE POLICY "client_read_products" ON products FOR SELECT
  USING (active = true);
CREATE POLICY "client_read_plans" ON subscription_plans FOR SELECT
  USING (active = true);

-- Seed some starter products
INSERT INTO products (name, description, base_price, display_order) VALUES
  ('AI Automation', 'Custom AI workflow automation and chatbot development', 2500.00, 1),
  ('Social Media Management', 'Full social media strategy, content creation and management', 1500.00, 2),
  ('Website Development', 'Custom website design, development and hosting', 3500.00, 3),
  ('SEO & Digital Marketing', 'Search engine optimization and digital ad campaigns', 1200.00, 4);

-- Seed some starter plans
INSERT INTO subscription_plans (name, billing_cycle, duration_months, discount_percent, display_order) VALUES
  ('Monthly', 'monthly', 1, 0, 1),
  ('Quarterly', 'quarterly', 3, 5, 2),
  ('6-Month Contract', 'semi-annual', 6, 10, 3),
  ('Annual Contract', 'annual', 12, 15, 4),
  ('One-Time Project', 'one-time', NULL, 0, 5);
