// Returns the price to display for a (product, plan) pair.
// Plan-level `price` (set per-plan in /admin/products) wins.
// Falls back to product.base_price × (1 - discount_percent / 100).
export function effectivePrice(plan, product) {
  if (plan?.price != null) return Number(plan.price)
  const base = Number(product?.base_price ?? 0)
  const discount = Number(plan?.discount_percent ?? 0)
  return Number((base * (1 - discount / 100)).toFixed(2))
}
