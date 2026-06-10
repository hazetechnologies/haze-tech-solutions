// api/_lib/affiliate-commissions.js
// Awards an affiliate commission when a referred client makes their first
// payment. Called from the Stripe webhook. NOT a serverless function — a shared
// helper module. Idempotent via the commissions.event_key UNIQUE constraint, so
// Stripe webhook redeliveries never double-award.
import { emitNotification } from './notifications.js'

/**
 * Award a first-payment commission if the client was referred by an affiliate.
 * Safe to call unconditionally — it no-ops when the client isn't referred, the
 * affiliate is the payer (self-referral), or a commission already exists.
 * Never throws (the caller is a webhook that must not 500 on commission errors).
 *
 * @param {object} sb           service-role Supabase client
 * @param {object} opts
 * @param {string} opts.clientId          referred client's id
 * @param {number} opts.baseAmountCents   the payment amount the commission is computed from
 * @param {string} opts.sourceTable       'invoices' | 'subscriptions'
 * @param {string} opts.sourceId          stripe invoice / subscription id
 * @param {string} opts.eventKey          idempotency key, e.g. first_payment:invoice:<id>
 */
export async function awardCommissionIfReferred(sb, { clientId, baseAmountCents, sourceTable, sourceId, eventKey }) {
  try {
    if (!clientId || !eventKey || !(baseAmountCents > 0)) return { awarded: false, reason: 'missing_input' }

    const { data: client } = await sb
      .from('clients').select('id, email, referred_by_affiliate_id').eq('id', clientId).maybeSingle()
    if (!client || !client.referred_by_affiliate_id) return { awarded: false, reason: 'not_referred' }

    const { data: affiliate } = await sb
      .from('affiliates').select('id, name, email, status').eq('id', client.referred_by_affiliate_id).maybeSingle()
    if (!affiliate || affiliate.status === 'suspended') return { awarded: false, reason: 'no_active_affiliate' }

    // Self-referral guard: an affiliate can't earn on their own purchase.
    if (affiliate.email && client.email && affiliate.email.trim().toLowerCase() === client.email.trim().toLowerCase()) {
      return { awarded: false, reason: 'self_referral' }
    }

    // Business-level "first payment only": skip if this client already produced one.
    const { data: prior } = await sb
      .from('commissions').select('id').eq('client_id', clientId).eq('affiliate_id', affiliate.id).limit(1).maybeSingle()
    if (prior) return { awarded: false, reason: 'already_awarded' }

    // Load the active first_payment rule (admin-configurable, not hardcoded).
    const { data: rule } = await sb
      .from('commission_rules').select('*').eq('event_type', 'first_payment').eq('is_active', true)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!rule) return { awarded: false, reason: 'no_active_rule' }

    let amount = 0
    if (rule.payout_kind === 'percent' && rule.percent != null) amount = Math.round(baseAmountCents * Number(rule.percent) / 100)
    else if (rule.payout_kind === 'amount' && rule.amount_cents != null) amount = rule.amount_cents
    if (rule.min_payout_cents != null) amount = Math.max(amount, rule.min_payout_cents)
    if (rule.cap_cents != null) amount = Math.min(amount, rule.cap_cents)
    if (!(amount > 0)) return { awarded: false, reason: 'zero_amount' }

    const { data: inserted, error } = await sb
      .from('commissions')
      .insert({
        affiliate_id: affiliate.id,
        rule_id: rule.id,
        client_id: clientId,
        source_table: sourceTable || null,
        source_id: sourceId || null,
        event_key: eventKey,
        base_amount_cents: baseAmountCents,
        amount_cents: amount,
        status: 'pending',
      })
      .select('id')
      .maybeSingle()

    // Unique-violation on event_key = a redelivery; treat as success-no-op.
    if (error) {
      if (error.code === '23505') return { awarded: false, reason: 'duplicate' }
      console.error('commission insert failed:', error.message)
      return { awarded: false, reason: 'insert_error' }
    }
    if (!inserted) return { awarded: false, reason: 'duplicate' }

    try {
      await emitNotification(sb, 'commission.earned', {
        affiliate: { id: affiliate.id, name: affiliate.name, email: affiliate.email },
        clientEmail: client.email,
        amount: (amount / 100).toFixed(2),
      })
    } catch (e) { console.error('commission.earned notify failed:', e?.message || e) }

    return { awarded: true, amount_cents: amount, affiliate_id: affiliate.id }
  } catch (e) {
    console.error('awardCommissionIfReferred error:', e?.message || e)
    return { awarded: false, reason: 'exception' }
  }
}
