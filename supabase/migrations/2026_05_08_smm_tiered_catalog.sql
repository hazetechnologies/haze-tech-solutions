-- 2026_05_08_smm_tiered_catalog.sql
-- Replace the single "Social Media Management" product with three tiered
-- products (Starter / Growth / Pro) and per-product Monthly + Annual plans.
-- Existing global plans (Quarterly / 6-Month / Annual / One-Time) are kept
-- for the non-SMM products (AI Automation / Website Dev / SEO).

begin;

-- 1. Rename + reprice existing SMM row → Growth (preserves UUID + any FKs).
update products
set name        = 'Social Media — Growth',
    base_price  = 1000.00,
    description = E'For SMBs serious about social. Two platforms with the clipping pipeline.\n\n' ||
                  E'• Everything in Starter, plus\n' ||
                  E'• 16 graphic posts / month\n' ||
                  E'• 12 short-form videos / month (Remotion + viral clipping)\n' ||
                  E'• 2 platforms (e.g. Instagram + TikTok)\n' ||
                  E'• Bi-weekly clipping pass against creator/source content\n' ||
                  E'• Monthly competitor audit (Instagram + YouTube)',
    display_order = 2
where id = '570dbc41-ad4b-4b1f-8bc8-f6cdb6eb9c86';

-- 2. Insert Starter and Pro tiers (skip if an active row with the same name already exists).
insert into products (name, description, base_price, active, display_order)
select 'Social Media — Starter',
       E'For solopreneurs and local businesses who need consistent posting on one platform.\n\n' ||
       E'• 8 graphic posts / month (Remotion templates)\n' ||
       E'• 4 short-form videos / month (voiceover + music + captions)\n' ||
       E'• 1 platform — Instagram, TikTok, or YouTube Shorts\n' ||
       E'• Monthly performance report (social + PageSpeed audit)\n' ||
       E'• One-time brand kit at onboarding (3 logos + 7 banners + bio/voice/hashtags)',
       500.00, true, 1
where not exists (select 1 from products where name = 'Social Media — Starter' and active = true);

insert into products (name, description, base_price, active, display_order)
select 'Social Media — Pro',
       E'For brands that need a full content engine across all surfaces.\n\n' ||
       E'• Everything in Growth, plus\n' ||
       E'• 30 graphic posts / month\n' ||
       E'• 24 short-form videos / month\n' ||
       E'• 4 long-form videos / month (60–90 sec)\n' ||
       E'• 3 platforms (Instagram + TikTok + YouTube Shorts)\n' ||
       E'• Image-to-video via Seedance 2.0 (product photos → 5 sec ad clips)\n' ||
       E'• Weekly clipping pass + automated highlight reels\n' ||
       E'• Brand kit refresh on demand\n' ||
       E'• Bi-weekly strategy call + monthly written growth review',
       2000.00, true, 3
where not exists (select 1 from products where name = 'Social Media — Pro' and active = true);

-- 3. Bump non-SMM products so the SMM tiers cluster at the top of dropdowns.
update products set display_order = 4 where id = 'feaf4085-6c76-4f24-ac92-538562cc563b';  -- AI Automation
update products set display_order = 5 where id = '2f07c80b-0d22-4d6c-a295-f536036e9e7e';  -- Website Development
update products set display_order = 6 where id = 'd7349be2-654a-405a-86c3-e0bf2d9f4cbe';  -- SEO & Digital Marketing

-- 4. Per-product Monthly + Annual plans for each SMM tier.
--    Stripe Prices are one-per-(product × billing_cycle), so each plan needs its
--    own row even though the names repeat across products. Each insert is guarded
--    by NOT EXISTS so replay is a no-op.
insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'Monthly', 'monthly', 1, 0, true, 1
from products p
where p.name = 'Social Media — Starter'
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'monthly' and s.active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'Annual (15% off)', 'annual', 12, 15, true, 2
from products p
where p.name = 'Social Media — Starter'
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'annual' and s.active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'Monthly', 'monthly', 1, 0, true, 1
from products p
where p.name = 'Social Media — Growth'
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'monthly' and s.active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'Annual (15% off)', 'annual', 12, 15, true, 2
from products p
where p.name = 'Social Media — Growth'
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'annual' and s.active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'Monthly', 'monthly', 1, 0, true, 1
from products p
where p.name = 'Social Media — Pro'
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'monthly' and s.active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'Annual (15% off)', 'annual', 12, 15, true, 2
from products p
where p.name = 'Social Media — Pro'
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'annual' and s.active = true);

commit;
