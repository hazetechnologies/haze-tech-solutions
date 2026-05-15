-- 2026_05_09_seo_plans_and_bundles.sql
-- Adds Monthly + Annual plans on the existing SEO product, and creates three
-- bundle products (Social+SEO, Website+Social, Complete) that combine
-- multiple service tiers at discounted package prices. Bundles are tracked
-- as single products with one plan each so they map cleanly to one Stripe
-- Price (admin handles the Stripe-side bundling).
-- Idempotent: all inserts guarded with WHERE NOT EXISTS.

begin;

-- 1. Beef up the SEO product description (was bare).
update products
set description = E'Get found. Stay found. Convert.\n\n' ||
                  E'• Keyword research and quarterly on-page SEO audit\n' ||
                  E'• Monthly technical SEO improvements (Core Web Vitals, schema, sitemap)\n' ||
                  E'• Content briefs + 2 published articles / month\n' ||
                  E'• Backlink prospecting + 4 outreach campaigns / month\n' ||
                  E'• Monthly ranking + traffic report'
where id = 'd7349be2-654a-405a-86c3-e0bf2d9f4cbe';

-- 2. Per-product plans on SEO: Monthly ($1,200/mo) + Annual (15% off, $12,240/yr).
insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, price, active, display_order)
select p.id, 'Monthly', 'monthly', 1, 0, 1200, true, 1
from products p
where p.name = 'SEO & Digital Marketing' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'monthly' and s.active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, price, active, display_order)
select p.id, 'Annual (15% off)', 'annual', 12, 15, 12240, true, 2
from products p
where p.name = 'SEO & Digital Marketing' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'annual' and s.active = true);

-- 3. Bundle 1 — Social Media + SEO (recurring monthly bundle, $1,800/mo).
insert into products (name, description, base_price, active, display_order)
select 'Bundle — Social + SEO',
       E'Both growth channels working together. Saves $400/mo vs buying separately.\n\n' ||
       E'• Everything in Social Media — Growth ($1,000 value)\n' ||
       E'• Everything in SEO & Digital Marketing ($1,200 value)\n' ||
       E'• Coordinated content calendar across organic search + social\n' ||
       E'• Single monthly performance report covering both channels\n' ||
       E'• One billing line for both services',
       1800, true, 12
where not exists (select 1 from products where name = 'Bundle — Social + SEO' and active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, price, active, display_order)
select p.id, 'Monthly', 'monthly', 1, 0, 1800, true, 1
from products p
where p.name = 'Bundle — Social + SEO' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'monthly' and s.active = true);

-- 4. Bundle 2 — Website + Social (12-month prepaid package, $14,000 one-time).
insert into products (name, description, base_price, active, display_order)
select 'Bundle — Website + Social (Annual)',
       E'Launch your site and run the content engine for a year. Prepaid one-time, saves $1,500.\n\n' ||
       E'• Website — Growth setup ($3,500 value)\n' ||
       E'• Social Media — Growth for 12 months ($12,000 value)\n' ||
       E'• Coordinated launch + content rollout from day 1\n' ||
       E'• Renews to standard monthly billing after month 12',
       14000, true, 13
where not exists (select 1 from products where name = 'Bundle — Website + Social (Annual)' and active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, price, active, display_order)
select p.id, '12-Month Package', 'one-time', null, 0, 14000, true, 1
from products p
where p.name = 'Bundle — Website + Social (Annual)' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'one-time' and s.active = true);

-- 5. Bundle 3 — Complete: Website + Social + SEO + Management (12-month prepaid, $40,000).
insert into products (name, description, base_price, active, display_order)
select 'Bundle — Complete (Annual)',
       E'Full-stack growth. Website, content, search, ongoing management — one package, one price. Saves $10,688 vs buying separately.\n\n' ||
       E'• Website — Pro setup ($7,500 value)\n' ||
       E'• Social Media — Pro for 12 months ($24,000 value)\n' ||
       E'• SEO & Digital Marketing for 12 months ($14,400 value)\n' ||
       E'• Website Maintenance — Pro for 12 months ($4,788 value)\n' ||
       E'• Dedicated account manager + bi-weekly strategy calls\n' ||
       E'• Quarterly business review',
       40000, true, 14
where not exists (select 1 from products where name = 'Bundle — Complete (Annual)' and active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, price, active, display_order)
select p.id, '12-Month Package', 'one-time', null, 0, 40000, true, 1
from products p
where p.name = 'Bundle — Complete (Annual)' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'one-time' and s.active = true);

commit;
