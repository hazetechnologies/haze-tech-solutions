-- 2026_05_08_c_webdev_tiered_catalog.sql
-- Replace single "Website Development" product with three tiered Setup products
-- (Starter/Growth/Pro) plus three Monthly Maintenance products. Each insert
-- guarded so replay is a no-op; uniqueness already enforced by indexes from
-- 2026_05_08_b_catalog_uniqueness.sql.

begin;

-- 1. Rename + reprice existing Website Development row → Web — Growth (anchor).
update products
set name        = 'Website — Growth',
    base_price  = 3500.00,
    description = E'For SMBs that need a real working website (not just a brochure).\n\n' ||
                  E'• Everything in Starter, plus\n' ||
                  E'• 5–7 pages (Home / About / Services / Contact + your pick of Blog, Portfolio, FAQ, Pricing)\n' ||
                  E'• 2 rounds of copy revisions\n' ||
                  E'• Blog OR Portfolio CMS wired into your admin\n' ||
                  E'• Contact form posts to your leads table (same place audit submissions land)\n' ||
                  E'• Analytics + Search Console wired up at launch',
    display_order = 6
where id = '2f07c80b-0d22-4d6c-a295-f536036e9e7e';

-- 2. Insert Starter and Pro Setup tiers.
insert into products (name, description, base_price, active, display_order)
select 'Website — Starter',
       E'For solo operators and side projects that just need to exist online.\n\n' ||
       E'• 1–3 pages (landing page or super-simple site) from your template choice\n' ||
       E'• AI-generated hero / about / services / contact copy + SEO meta\n' ||
       E'• Brand-kit colors and voice integrated (if you have one)\n' ||
       E'• Custom domain wired up + Vercel deploy\n' ||
       E'• 1 round of copy revisions',
       1500.00, true, 5
where not exists (select 1 from products where name = 'Website — Starter' and active = true);

insert into products (name, description, base_price, active, display_order)
select 'Website — Pro',
       E'For sites that are core to the business — content-heavy, lead-driving.\n\n' ||
       E'• Everything in Growth, plus\n' ||
       E'• 8–12 pages, any combination\n' ||
       E'• 4 rounds of copy revisions\n' ||
       E'• Full CMS (Blog + Portfolio + Press)\n' ||
       E'• Page-speed optimization pass\n' ||
       E'• Newsletter signup integration\n' ||
       E'• 30-day post-launch support included',
       7500.00, true, 7
where not exists (select 1 from products where name = 'Website — Pro' and active = true);

-- 3. Insert three Monthly Maintenance products (sit at the end of the catalog
--    since they're attached after a website ships, not picked at conversion).
insert into products (name, description, base_price, active, display_order)
select 'Website Maintenance — Starter',
       E'Monthly retainer for sites built on Website — Starter.\n\n' ||
       E'• 4 hours / month of edits and content swaps\n' ||
       E'• Uptime monitoring\n' ||
       E'• Monthly Lighthouse score with notes',
       99.00, true, 9
where not exists (select 1 from products where name = 'Website Maintenance — Starter' and active = true);

insert into products (name, description, base_price, active, display_order)
select 'Website Maintenance — Growth',
       E'Monthly retainer for sites built on Website — Growth.\n\n' ||
       E'• 8 hours / month of edits and content updates\n' ||
       E'• Blog / Portfolio CMS support\n' ||
       E'• Uptime monitoring + monthly Lighthouse',
       199.00, true, 10
where not exists (select 1 from products where name = 'Website Maintenance — Growth' and active = true);

insert into products (name, description, base_price, active, display_order)
select 'Website Maintenance — Pro',
       E'Monthly retainer for sites built on Website — Pro.\n\n' ||
       E'• 16 hours / month of edits, content, and feature work\n' ||
       E'• Priority response (same-business-day)\n' ||
       E'• A/B testing setup + monthly performance reports',
       399.00, true, 11
where not exists (select 1 from products where name = 'Website Maintenance — Pro' and active = true);

-- 4. Push SEO past the maintenance products in display order.
update products set display_order = 8 where id = 'd7349be2-654a-405a-86c3-e0bf2d9f4cbe';

-- 5. Per-product One-Time setup plans for the three Web Setup tiers.
insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'One-Time Setup', 'one-time', null, 0, true, 1
from products p
where p.name = 'Website — Starter' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'one-time' and s.active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'One-Time Setup', 'one-time', null, 0, true, 1
from products p
where p.name = 'Website — Growth' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'one-time' and s.active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'One-Time Setup', 'one-time', null, 0, true, 1
from products p
where p.name = 'Website — Pro' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'one-time' and s.active = true);

-- 6. Per-product Monthly plans for the three Maintenance tiers.
insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'Monthly', 'monthly', 1, 0, true, 1
from products p
where p.name = 'Website Maintenance — Starter' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'monthly' and s.active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'Monthly', 'monthly', 1, 0, true, 1
from products p
where p.name = 'Website Maintenance — Growth' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'monthly' and s.active = true);

insert into subscription_plans (product_id, name, billing_cycle, duration_months, discount_percent, active, display_order)
select p.id, 'Monthly', 'monthly', 1, 0, true, 1
from products p
where p.name = 'Website Maintenance — Pro' and p.active = true
  and not exists (select 1 from subscription_plans s where s.product_id = p.id and s.billing_cycle = 'monthly' and s.active = true);

commit;
