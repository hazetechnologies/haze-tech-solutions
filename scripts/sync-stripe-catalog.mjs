// One-shot: create Stripe Products + Prices for our products + subscription_plans,
// write the IDs back to the DB. Idempotent — skips rows that already have IDs.
//
// Usage:
//   node scripts/sync-stripe-catalog.mjs           # actually create
//   node scripts/sync-stripe-catalog.mjs --dry     # report what would change
//
// Reads STRIPE_SECRET_KEY from the admin_settings DB row first, then env var.
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
} catch (e) { console.error('env load failed:', e.message) }

const DRY = process.argv.includes('--dry')

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

async function getStripeKey() {
  const { data } = await sb.from('admin_settings').select('value').eq('key', 'stripe_secret_key').maybeSingle()
  return data?.value || process.env.STRIPE_SECRET_KEY
}

const billingCycleToInterval = {
  monthly:    { interval: 'month',  interval_count: 1 },
  quarterly:  { interval: 'month',  interval_count: 3 },
  'semi-annual': { interval: 'month', interval_count: 6 },
  annual:     { interval: 'year',   interval_count: 1 },
  'one-time': null,                                       // null → use Price without recurring
}

async function main() {
  const stripeKey = await getStripeKey()
  if (!stripeKey) {
    console.error('No Stripe secret key. Set in /admin/settings or env STRIPE_SECRET_KEY.')
    process.exit(1)
  }
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' })

  const [{ data: products }, { data: plans }] = await Promise.all([
    sb.from('products').select('*').eq('active', true).order('display_order'),
    sb.from('subscription_plans').select('*').eq('active', true).order('display_order'),
  ])

  console.log(`${products.length} products, ${plans.length} plans${DRY ? ' (DRY RUN)' : ''}\n`)

  // 1. Create one Stripe Product per DB product (skip if stripe_product_id already set)
  for (const p of products) {
    if (p.stripe_product_id) {
      console.log(`✓ product "${p.name}" already linked → ${p.stripe_product_id}`)
      continue
    }
    if (DRY) {
      console.log(`+ would create Stripe Product for "${p.name}"`)
      continue
    }
    const sp = await stripe.products.create({
      name: p.name, metadata: { db_product_id: p.id },
    })
    await sb.from('products').update({ stripe_product_id: sp.id }).eq('id', p.id)
    console.log(`+ created Stripe Product ${sp.id} for "${p.name}"`)
  }

  // 2. Create one Stripe Price per (product, plan) pair, but plans don't have
  //    product_id (they're global). So for each (active product) × (active plan)
  //    we generate a Price keyed by both. We track this via a separate lookup
  //    table? No — for simplicity, generate per-(plan only) prices on a chosen
  //    primary product. The plan itself stores the price_id, so picking 1 of
  //    N products per plan is fine for now since plans aren't truly product-
  //    scoped in our schema.
  //    A future migration could break this out into product_plan_prices(prod, plan, price_id).
  // For now: pick the first Social Media Management product as the price's parent
  // (the user said this integration is for "social-media-marketing products").
  const refreshed = await sb.from('products').select('*').eq('active', true)
  const primaryProduct = refreshed.data.find(p => /social.media.management/i.test(p.name))
                        ?? refreshed.data[0]
  if (!primaryProduct?.stripe_product_id) {
    console.error('No primary product found with stripe_product_id; aborting plan sync.')
    process.exit(1)
  }

  for (const plan of plans) {
    if (plan.stripe_price_id) {
      console.log(`✓ plan "${plan.name}" already linked → ${plan.stripe_price_id}`)
      continue
    }
    const recurring = billingCycleToInterval[plan.billing_cycle]
    if (recurring === undefined) {
      console.log(`! plan "${plan.name}": unknown billing_cycle "${plan.billing_cycle}", skipping`)
      continue
    }
    // Discount-adjusted unit amount (in cents) of the primary product's base price
    const discountPct = Number(plan.discount_percent ?? 0)
    const unitAmount = Math.round(Number(primaryProduct.base_price) * (1 - discountPct / 100) * 100)

    if (DRY) {
      console.log(`+ would create Price for plan "${plan.name}" (${plan.billing_cycle}, $${(unitAmount/100).toFixed(2)})`)
      continue
    }
    const priceParams = {
      product: primaryProduct.stripe_product_id,
      currency: 'usd',
      unit_amount: unitAmount,
      nickname: `${primaryProduct.name} — ${plan.name}`,
      metadata: { db_plan_id: plan.id, db_product_id: primaryProduct.id },
    }
    if (recurring) priceParams.recurring = recurring
    const price = await stripe.prices.create(priceParams)
    await sb.from('subscription_plans').update({ stripe_price_id: price.id }).eq('id', plan.id)
    console.log(`+ created Price ${price.id} for plan "${plan.name}" (${plan.billing_cycle}, $${(unitAmount/100).toFixed(2)})`)
  }

  console.log(`\n${DRY ? 'Dry-run done.' : '✓ Sync complete.'}`)
}

main().catch(e => { console.error('ERROR:', e); process.exit(1) })
