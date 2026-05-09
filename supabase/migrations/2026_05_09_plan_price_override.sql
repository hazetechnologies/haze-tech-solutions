-- 2026_05_09_plan_price_override.sql
-- Adds an explicit `price` column to subscription_plans so admins can set
-- per-plan prices directly instead of relying on `products.base_price` ×
-- `discount_percent` math. Nullable: when null, callers fall back to the
-- computed price. Idempotent.

alter table subscription_plans
  add column if not exists price numeric(10,2);

comment on column subscription_plans.price is
  'Optional per-plan display price. When set, overrides the products.base_price × discount_percent computation in the admin and pricing UIs. Stripe billing always charges from stripe_price_id regardless of this column.';
