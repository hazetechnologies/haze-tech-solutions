-- ─────────────────────────────────────────────────────────────
-- Haze Tech Solutions — Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Leads (contact form + audit submissions)
CREATE TABLE IF NOT EXISTS leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  business_name text,
  service_interest text,
  message text,
  source text DEFAULT 'contact',       -- 'contact' | 'audit'
  url text,                             -- audit URL
  perf_score integer,
  seo_score integer,
  mobile_score integer,
  security_score integer,
  cro_score integer,
  overall_score integer,
  status text DEFAULT 'new',           -- 'new' | 'contacted' | 'closed'
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Portfolio items
CREATE TABLE IF NOT EXISTS portfolio_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  client text,
  industry text,
  problem text,
  result text,
  service_tag text,
  type text DEFAULT 'case_study',      -- 'case_study' | 'video'
  youtube_url text,
  image_url text,
  display_order integer DEFAULT 0,
  published boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Blog posts
CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  content text,
  excerpt text,
  cover_image_url text,
  published boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Press releases
CREATE TABLE IF NOT EXISTS press_releases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  content text,
  excerpt text,
  source text,
  source_url text,
  published_date date,
  published boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE press_releases  ENABLE ROW LEVEL SECURITY;

-- Public: read published content
CREATE POLICY "public_read_portfolio"  ON portfolio_items  FOR SELECT USING (published = true);
CREATE POLICY "public_read_blog"       ON blog_posts       FOR SELECT USING (published = true);
CREATE POLICY "public_read_press"      ON press_releases   FOR SELECT USING (published = true);

-- Public: insert leads from forms
CREATE POLICY "public_insert_leads"    ON leads            FOR INSERT WITH CHECK (true);

-- Authenticated (admin): full access to everything
CREATE POLICY "admin_all_leads"        ON leads            FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_portfolio"    ON portfolio_items  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_blog"         ON blog_posts       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "admin_all_press"        ON press_releases   FOR ALL USING (auth.role() = 'authenticated');

-- ── Seed 3 default portfolio items (replaces hardcoded ones) ──

INSERT INTO portfolio_items (title, client, industry, problem, result, service_tag, type, published, display_order) VALUES
  ('Automated Lead Follow-Up System', 'Coastal Coffee Co.', 'Food & Beverage', 'Catering inquiries were going unanswered for days, losing bookings', '3× response rate, 40% increase in bookings within 60 days', 'AI Automation', 'case_study', true, 1),
  ('Social Media Growth Campaign', 'Ember Boutique', 'Retail', 'Stagnant Instagram presence with low engagement and 12K followers', '12K → 47K Instagram followers in 90 days, 4× engagement rate', 'Social Media', 'case_study', true, 2),
  ('Website Redesign & SEO', 'Summit Legal Group', 'Professional Services', 'Outdated website with high bounce rate and poor search rankings', '210% organic traffic increase, 55% lower bounce rate in 90 days', 'Website Dev', 'case_study', true, 3);

-- ─── Lead → Client conversion (2026-05-03) ────────────────────────────
-- Forward link from a converted lead to the client it became.
-- ON DELETE SET NULL: if a client is removed, the lead remains as
-- historical record but the link clears.
-- NOTE: Requires `clients` table from supabase-portal-schema.sql — run that
-- file first when bootstrapping a fresh environment, or this FK will fail.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS converted_to_client_id uuid
  REFERENCES clients(id) ON DELETE SET NULL;

-- Partial index — most leads will not be converted, so keep index small.
CREATE INDEX IF NOT EXISTS leads_converted_to_client_id_idx
  ON leads(converted_to_client_id) WHERE converted_to_client_id IS NOT NULL;
