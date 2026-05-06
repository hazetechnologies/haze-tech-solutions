-- Add nullable FK columns to clients so we can track which Product + Plan a
-- client was sold. Old text columns (product, price, subscription_terms)
-- stay populated as denormalized cache so existing queries/reports keep
-- rendering without joins.

alter table clients
  add column if not exists product_id uuid references products(id) on delete set null,
  add column if not exists subscription_plan_id uuid references subscription_plans(id) on delete set null;

create index if not exists clients_product_id_idx on clients(product_id);
create index if not exists clients_subscription_plan_id_idx on clients(subscription_plan_id);
