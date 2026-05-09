-- 2026_05_08_d_portfolio_real_seed.sql
-- Replace the 3 placeholder portfolio rows (Coastal Coffee / Ember Boutique /
-- Summit Legal — all generic) with real Haze Tech Solutions client work.
-- Placeholders are unpublished (kept in DB for reference) rather than deleted.
-- Each insert is guarded so replay is a no-op.

begin;

-- 1. Unpublish placeholder rows so they stop showing on the homepage.
update portfolio_items set published = false where id in (
  'b4087b2a-49cc-42c7-9a09-454a3416f065',  -- Coastal Coffee Co.
  'dc7ccfe1-d5c4-49ac-b680-88d2c1567ddb',  -- Ember Boutique
  'a89ba711-4231-4c27-b3a2-ef0fc47785c8'   -- Summit Legal Group
);

-- 2. Real client work — case studies, design showcases, and a video slot.
--    image_url and youtube_url are left null; admin pastes them in via /admin/portfolio.

insert into portfolio_items (title, client, industry, problem, result, service_tag, type, display_order, published)
select 'Real Estate Content Engine',
       'Segula Management Group',
       'Vacation Rental & Real Estate',
       'A growing vacation-rental and real-estate brand needed daily content across Instagram, TikTok, and YouTube. Manual production wasn''t sustainable past a few posts a week.',
       'Built an automated content engine: branded graphic posts, voiceover videos, and viral clip mining all rendered nightly via n8n + Remotion on a private VPS. Now produces ~80 pieces of social content / week with zero manual production.',
       'AI Automation',
       'case_study',
       1,
       true
where not exists (select 1 from portfolio_items where client = 'Segula Management Group' and title = 'Real Estate Content Engine');

insert into portfolio_items (title, client, industry, problem, result, service_tag, type, display_order, published)
select 'Sports Highlight Brand Identity',
       'Haze Clips',
       'Sports Content & Media',
       'A new sports-clipping creator needed a complete visual identity from scratch — logo set, banners across seven social platforms, voice and tone, content pillars, and a hashtag bank.',
       'Generated the full brand kit in under five minutes via our automated pipeline: 3 logo variants, 7 platform banners (Instagram 9:16, YouTube 16:9, TikTok 1:1, etc.), bio copy, voice guide, and hashtag set — ready to publish day one.',
       'Social Media',
       'case_study',
       2,
       true
where not exists (select 1 from portfolio_items where client = 'Haze Clips' and title = 'Sports Highlight Brand Identity');

insert into portfolio_items (title, client, industry, problem, result, service_tag, type, display_order, published)
select 'Internal Agency Platform',
       'Haze Tech Solutions',
       'Digital Agency (Internal)',
       'Running a multi-brand agency means juggling lead capture, client onboarding, brand-kit delivery, website builds, and Stripe billing. Off-the-shelf tools didn''t connect — we needed one platform.',
       'Designed and shipped our own multi-tenant admin: lead capture with audit reports, client portal with project tracking, brand-kit generator, website-builder pipeline, and full Stripe billing — all on Vercel + Supabase. The same platform that runs us.',
       'Website Dev',
       'case_study',
       3,
       true
where not exists (select 1 from portfolio_items where client = 'Haze Tech Solutions' and title = 'Internal Agency Platform');

insert into portfolio_items (title, client, industry, problem, result, service_tag, type, display_order, published)
select 'Branded Real Estate Reels',
       'Segula Management Group',
       'Vacation Rental & Real Estate',
       'Property listings needed scroll-stopping short-form video for Instagram Reels and TikTok — not generic stock-music slideshows.',
       'Custom Remotion templates with property highlights, animated price and amenity badges, and brand-consistent typography. Each reel renders in under 90 seconds via the VPS pipeline.',
       'Social Media',
       'video',
       4,
       true
where not exists (select 1 from portfolio_items where client = 'Segula Management Group' and title = 'Branded Real Estate Reels');

insert into portfolio_items (title, client, industry, problem, result, service_tag, type, display_order, published)
select 'STR Market Data Pipeline',
       'Haze Tech Solutions',
       'Vacation Rental Analytics',
       'Vacation-rental managers need pricing and availability data on competitor properties across Airbnb, Booking, and VRBO — but those sites actively block scrapers.',
       'Deployed a Playwright browser agent on a private VPS with residential proxy rotation. Feeds nightly market data into n8n workflows for under $10/mo — a Firecrawl alternative built for this exact use case.',
       'AI Automation',
       'case_study',
       5,
       true
where not exists (select 1 from portfolio_items where client = 'Haze Tech Solutions' and title = 'STR Market Data Pipeline');

insert into portfolio_items (title, client, industry, problem, result, service_tag, type, display_order, published)
select 'Real Estate Visual System',
       'Segula Management Group',
       'Vacation Rental & Real Estate',
       'A property-management firm needed a full visual identity that worked across listing photos, social channels, and printed property packets.',
       'A 3-logo set, color palette tuned to property photography, voice and tone guide for property descriptions, and 7 platform banners (Instagram 9:16, YouTube 16:9, TikTok 1:1, plus profile imagery).',
       'Social Media',
       'case_study',
       6,
       true
where not exists (select 1 from portfolio_items where client = 'Segula Management Group' and title = 'Real Estate Visual System');

commit;
