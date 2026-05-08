-- 2026_05_08_b_catalog_uniqueness.sql
-- DB-level guards so the catalog can't drift via migration replay, ad-hoc
-- inserts, or partial restores. Companion to 2026_05_08_smm_tiered_catalog.sql,
-- which still applies its own NOT EXISTS guards to keep replay a no-op even on
-- DBs that haven't gotten this constraint yet.

-- One active row per product name (case-sensitive — names are an editor field).
-- Inactive duplicates (archived/superseded products) are allowed.
create unique index if not exists products_active_name_unique
  on products (name)
  where active = true;

-- One active per-product plan per (product_id, billing_cycle). Legacy global
-- plans (product_id IS NULL) are excluded since the convert-lead modal already
-- routes those to non-SMM products only.
create unique index if not exists subscription_plans_active_product_cycle_unique
  on subscription_plans (product_id, billing_cycle)
  where active = true and product_id is not null;
