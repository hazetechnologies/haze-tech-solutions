// api/_lib/email-responder.js
// Email auto-responder agent. Two sources, one brain:
//   - pollInbound(): reads the Hostinger mailbox over IMAP and replies to real
//     human inquiries, drawing answers from the SAME FAQ knowledge base as the
//     website chatbot (chatbot_faqs + business_info).
//   - pollLeads(): sends a one-time FAQ-aware reply to new contact/lead-form rows.
// Both go through draftReply(), which classifies each message as ANSWER / DEFER /
// IGNORE so spam, marketing, and automated notifications never get a response.
//
// This module is imported by api/website.js (it is NOT a serverless endpoint, so
// it does not count toward Vercel's 12-function Hobby cap).
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { getSetting } from './stripe.js'
import { trackedOpenAi } from './tracked-openai.js'
import { sendEmail } from './email.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const TONES = {
  professional: 'Be professional, knowledgeable, and concise.',
  friendly: 'Be warm, friendly, and conversational.',
  casual: 'Be casual and approachable.',
}

const DEFAULT_DEFER =
  'Thanks for reaching out! One of our team members will personally review your message and follow up with you shortly.'

// Senders we never auto-reply to (substring match on the From address, lowercase).
const DEFAULT_BLOCKLIST = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster',
  'bounce', 'notification', 'vercel.com', 'supabase', 'stripe.com', 'github.com',
  'google.com', 'paypal', 'facebookmail.com', 'mailchimp', 'sendgrid', 'amazonaws',
].join(',')

// ── Config ───────────────────────────────────────────────────────────────────

/** Read all email_responder_* settings (DB-first, env fallback) with defaults.
 * Pass { fresh: true } to bypass the 60s settings cache — used by the admin
 * "Run now" action so a just-saved toggle/prompt takes effect immediately. */
export async function getResponderConfig(opts = {}) {
  const g = (k, env) => getSetting(k, env, opts)
  const [
    enabled, inbound, leads, imapHost, imapPort, model, maxTokens,
    personality, systemPrompt, signature, deferMessage, maxPerRun, blocklist, inboundAck,
  ] = await Promise.all([
    g('email_responder_enabled'),
    g('email_responder_inbound_enabled'),
    g('email_responder_leads_enabled'),
    g('email_responder_imap_host'),
    g('email_responder_imap_port'),
    g('email_responder_model'),
    g('email_responder_max_tokens'),
    g('email_responder_personality'),
    g('email_responder_system_prompt'),
    g('email_responder_signature'),
    g('email_responder_defer_message'),
    g('email_responder_max_per_run'),
    g('email_responder_blocklist'),
    g('email_responder_inbound_ack'),
  ])
  return {
    enabled: enabled === 'true',
    inboundEnabled: inbound !== 'false', // sub-toggles default ON when master is on
    leadsEnabled: leads !== 'false',
    // Inbound replies ONLY when the agent can answer from FAQs. Acknowledgment/
    // "a team member will follow up" emails are NOT sent unless explicitly enabled.
    inboundAck: inboundAck === 'true',
    imapHost: (imapHost || 'imap.hostinger.com').trim(),
    imapPort: parseInt(imapPort, 10) || 993,
    model: model || 'gpt-4o-mini',
    maxTokens: Math.min(1500, Math.max(80, parseInt(maxTokens, 10) || 400)),
    personality: TONES[personality] ? personality : 'professional',
    systemPrompt: systemPrompt || 'You are Haze, the email assistant for Haze Tech Solutions.',
    signature: signature || '',
    deferMessage: deferMessage || DEFAULT_DEFER,
    maxPerRun: Math.min(25, Math.max(1, parseInt(maxPerRun, 10) || 5)),
    // Empty/whitespace falls back to defaults so saving the page with a blank
    // box never silently disables the built-in spam guards (codex H3).
    blocklist: (blocklist && blocklist.trim() ? blocklist : DEFAULT_BLOCKLIST)
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  }
}

// ── Knowledge base (same source as the chatbot) ──────────────────────────────

async function fetchKnowledge() {
  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
  let businessInfo = [], faqs = []
  try {
    const [bizRes, faqRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/business_info?select=*&active=eq.true&order=display_order`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/chatbot_faqs?select=*&active=eq.true`, { headers }),
    ])
    businessInfo = (await bizRes.json()) || []
    faqs = (await faqRes.json()) || []
  } catch (e) {
    console.error('[email-responder] knowledge fetch failed:', e?.message || e)
  }
  return { businessInfo: Array.isArray(businessInfo) ? businessInfo : [], faqs: Array.isArray(faqs) ? faqs : [] }
}

function buildSystemPrompt(cfg, knowledge, kind) {
  let p = cfg.systemPrompt
  p += `\n\nTone: ${TONES[cfg.personality]}`

  if (knowledge.businessInfo.length) {
    p += '\n\n=== BUSINESS INFORMATION ===\n'
    for (const i of knowledge.businessInfo) p += `\n[${(i.category || '').toUpperCase()}: ${i.title}]\n${i.content}\n`
  }
  if (knowledge.faqs.length) {
    p += '\n\n=== FREQUENTLY ASKED QUESTIONS ===\n'
    for (const f of knowledge.faqs) p += `\nQ: ${f.question}\nA: ${f.answer}\n`
  }

  p += `\n\n=== HOW TO RESPOND ===
You are replying to an email. Begin your reply with EXACTLY ONE control token on its own first line, then the email body:
- [[ANSWER]] — the sender is a real person with a genuine question about or interest in the business. Answer helpfully using the BUSINESS INFORMATION / FAQs above. This INCLUDES broad or open-ended inquiries such as "what do you offer", "I'm interested in your services", "how can you help me", or "tell me about your pricing" — give a concise, useful overview drawn from the information above and invite a clear next step (a quick call, or sharing a few details about their project). Use ONLY the information provided — never invent specific prices, timelines, guarantees, or commitments that aren't stated above. If only part of their question is covered, answer that part and offer to connect them for the rest. Prefer ANSWER whenever the information above lets you say something genuinely useful.
- [[DEFER]] — use ONLY when a genuine person asks about something the information above truly cannot address (e.g. account-specific details, a custom quote beyond the listed pricing, or a topic the business does not handle). Briefly acknowledge and say a team member will follow up.`
  if (kind === 'inbound') {
    p += `
- [[IGNORE]] — the message is spam, cold sales/marketing outreach, a newsletter, or an automated/transactional notification (receipts, alerts, system notices) rather than a genuine inquiry. Output ONLY the token and nothing else; we will not send a reply.`
  }
  p += `

When deferring, use wording close to: "${cfg.deferMessage}"
Keep replies concise and well-formatted for email (a short greeting, 1–3 short paragraphs). Do NOT use markdown. Do NOT include a subject line. Do NOT add a signature — it is appended automatically. Write in plain prose.`
  return p
}

/**
 * Classify + draft a reply. Returns { outcome: 'answer'|'defer'|'ignore', text }.
 * `kind` is 'inbound' or 'lead' (leads never IGNORE — they opted in, so an IGNORE
 * is coerced to DEFER). On any AI failure, falls back to a safe DEFER.
 */
export async function draftReply({ cfg, knowledge, kind, fromName, subject, body, leadFields }) {
  const systemPrompt = buildSystemPrompt(cfg, knowledge, kind)
  let userContent
  if (kind === 'lead') {
    const f = leadFields || {}
    userContent = `A new lead just submitted a form on our website. Write them a warm reply.\n` +
      `Name: ${f.name || fromName || 'there'}\n` +
      (f.business_name ? `Business: ${f.business_name}\n` : '') +
      (f.service_interest ? `Interested in: ${f.service_interest}\n` : '') +
      `\nTheir message:\n${(body || '(no message provided)').slice(0, 4000)}`
  } else {
    userContent = `From: ${fromName || 'Unknown'}\nSubject: ${subject || '(no subject)'}\n\nEmail body:\n${(body || '').slice(0, 4000)}`
  }

  let raw = ''
  try {
    const { data } = await trackedOpenAi({
      apiKey: await getSetting('openai_api_key', 'OPENAI_API_KEY'),
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      params: { max_tokens: cfg.maxTokens, temperature: 0.5 },
      distinctId: 'email-responder',
      eventProperties: { surface: 'email-responder', kind },
    })
    raw = data?.choices?.[0]?.message?.content || ''
  } catch (e) {
    console.error('[email-responder] draft failed:', e?.message || e)
    return { outcome: 'defer', text: cfg.deferMessage }
  }

  // Parse the leading control token.
  let outcome = 'defer'
  const m = raw.match(/^\s*\[\[(ANSWER|DEFER|IGNORE)\]\]/i)
  if (m) outcome = m[1].toLowerCase()
  let text = raw.replace(/^\s*\[\[(ANSWER|DEFER|IGNORE)\]\]\s*/i, '').trim()

  if (kind === 'lead' && outcome === 'ignore') outcome = 'defer' // leads always get a reply
  if (outcome === 'defer' && !text) text = cfg.deferMessage
  if (outcome === 'ignore') text = ''

  return { outcome, text }
}

// ── Outgoing reply rendering ─────────────────────────────────────────────────

// Replies are sent as plain text (no branded HTML template), so we only build a
// text body. Signature, if set, is appended in plain text.
function replyText(text, signature) {
  return signature ? `${text}\n\n${signature}` : text
}

// ── Inbound IMAP polling ─────────────────────────────────────────────────────

const NO_REPLY_LOCALPART = /(^|[._-])(no-?reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|notifications?)([._-]|@|$)/i

// Layer-1 deterministic skip. Returns a reason string to skip, or null to proceed.
function deterministicSkip(parsed, fromAddr, ourMailbox, blocklist) {
  const lc = (fromAddr || '').toLowerCase()
  if (!lc) return 'no-from'
  if (ourMailbox && lc === ourMailbox.toLowerCase()) return 'self'
  if (NO_REPLY_LOCALPART.test(lc)) return 'no-reply-sender'
  for (const term of blocklist) if (term && lc.includes(term)) return `blocklist:${term}`

  const h = parsed.headers // Map of lowercased header name -> value
  const get = (k) => { const v = h?.get(k); return v == null ? '' : String(typeof v === 'object' ? (v.value ?? '') : v) }
  const autoSub = get('auto-submitted').toLowerCase()
  if (autoSub && autoSub !== 'no') return 'auto-submitted'
  const prec = get('precedence').toLowerCase()
  if (/bulk|list|junk|auto_reply/.test(prec)) return `precedence:${prec}`
  // mailparser collapses List-* headers into a single normalized 'list' key
  // (codex M1); check that plus the raw names defensively.
  if (h?.has('list') || h?.has('list-id') || h?.has('list-unsubscribe') || h?.has('x-auto-response-suppress')) return 'mailing-list'
  // Null Return-Path ("<>") is a bounce/auto-generated message. mailparser may
  // parse return-path as an address object, so inspect text + address (codex M2).
  if (h?.has('return-path')) {
    const rp = h.get('return-path')
    const rpText = (typeof rp === 'object' ? (rp.text ?? '') : String(rp ?? '')).trim()
    const rpAddr = (typeof rp === 'object' ? (rp.value?.[0]?.address ?? '') : '').trim()
    if (rpText === '<>' || (typeof rp === 'object' && rpAddr === '')) return 'bounce'
  }
  return null
}

async function logRow(sb, row) {
  try { await sb.from('email_autoresponses').insert(row) }
  catch (e) { console.error('[email-responder] log insert failed:', e?.message || e) }
}

export async function pollInbound(sb, cfg) {
  const user = await getSetting('SMTP_USER', 'SMTP_USER')
  const pass = await getSetting('SMTP_PASS', 'SMTP_PASS')
  if (!user || !pass) return { skipped: 'no-credentials', replied: 0, ignored: 0 }

  // Bound every network phase well under vercel.json maxDuration:60 so a stalled
  // IMAP host can't run the function past its budget (codex H4).
  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: cfg.imapPort === 993 || cfg.imapPort === 465,
    auth: { user, pass },
    logger: false,
    connectionTimeout: 12_000,
    greetingTimeout: 8_000,
    socketTimeout: 20_000,
  })

  let replied = 0, ignored = 0, skipped = 0, scanned = 0
  try {
    await client.connect()
  } catch (e) {
    console.error('[email-responder] IMAP connect failed:', e?.message || e)
    return { error: 'imap-connect-failed', detail: e?.message || String(e) }
  }

  let lock
  try {
    lock = await client.getMailboxLock('INBOX')
    // IMAP identity for messages that lack a Message-ID, so dedup never relies
    // on a nullable column (codex H2).
    const uidv = client.mailbox?.uidValidity != null ? String(client.mailbox.uidValidity) : 'na'

    // Only scan recent unseen mail — a large spam backlog can't blow the budget
    // on the envelope pass (codex M4).
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    let uids = []
    try { uids = await client.search({ seen: false, since }, { uid: true }) } catch { uids = [] }
    if (!uids || !uids.length) return { replied, ignored, skipped, scanned }

    // Envelope pass → a robust dedup key per message (Message-ID, else uidvalidity:uid).
    const metas = []
    for await (const msg of client.fetch(uids, { uid: true, envelope: true }, { uid: true })) {
      const messageId = msg.envelope?.messageId || null
      metas.push({ uid: msg.uid, messageId, key: messageId || `imap:${uidv}:${msg.uid}` })
    }
    const keys = metas.map((m) => m.key)
    let seen = new Set()
    if (keys.length) {
      const { data: existing } = await sb.from('email_autoresponses').select('message_id').in('message_id', keys)
      seen = new Set((existing || []).map((r) => r.message_id))
    }
    // Newest-first: reply to the freshest mail this run rather than draining a
    // stale unseen backlog oldest-first. metas are ascending (search/fetch order),
    // so the highest UIDs are newest. Older unseen is still worked through over
    // subsequent runs (processed messages are logged + filtered above).
    const fresh = metas.filter((m) => !seen.has(m.key))
    const todo = fresh.slice(-cfg.maxPerRun).reverse()
    if (!todo.length) return { replied, ignored, skipped, scanned }

    const knowledge = await fetchKnowledge()
    for (const meta of todo) {
      scanned++

      // CLAIM before drafting/sending. The unique partial index on message_id
      // makes this insert atomic, so two overlapping runs (cron + Run-now) can
      // never both reply to the same message (codex H1). A 23505 means another
      // run already owns it → skip.
      let claimId
      try {
        const { data: claim, error: claimErr } = await sb.from('email_autoresponses')
          .insert({ source: 'inbound', message_id: meta.key, notes: 'processing', ai_answered: false })
          .select('id').single()
        if (claimErr) {
          if (claimErr.code !== '23505') console.error('[email-responder] claim failed:', claimErr.message)
          continue
        }
        claimId = claim.id
      } catch (e) { console.error('[email-responder] claim threw:', e?.message || e); continue }

      const finalize = (patch) => sb.from('email_autoresponses').update(patch).eq('id', claimId)
      try {
        let source = null
        for await (const msg of client.fetch(meta.uid, { uid: true, source: true }, { uid: true })) source = msg.source
        if (!source) { await finalize({ reply_status: 'skipped', notes: 'no-source' }); continue }
        const parsed = await simpleParser(source)
        const fromAddr = parsed.from?.value?.[0]?.address || ''
        const fromName = parsed.from?.value?.[0]?.name || fromAddr
        const subject = parsed.subject || ''
        const messageId = parsed.messageId || meta.messageId || null

        // Layer 1 — deterministic skip. Leave UNSEEN so a human still sees it.
        const skipReason = deterministicSkip(parsed, fromAddr, user, cfg.blocklist)
        if (skipReason) {
          skipped++
          await finalize({ to_email: fromAddr, subject, reply_status: 'skipped', notes: `skip:${skipReason}` })
          continue
        }

        // Layer 2 — AI relevance gate + draft.
        const body = parsed.text || parsed.html?.replace(/<[^>]+>/g, ' ') || ''
        const { outcome, text } = await draftReply({ cfg, knowledge, kind: 'inbound', fromName, subject, body })

        if (outcome === 'ignore') {
          ignored++
          await finalize({ to_email: fromAddr, subject, reply_status: 'skipped', notes: 'ignore:not-an-inquiry' })
          continue // leave UNSEEN
        }

        // Inbox conversations: don't send canned acknowledgment/"team will follow
        // up" emails. Only a real FAQ-grounded answer goes out (unless the admin
        // opts back in via email_responder_inbound_ack). Deferred mail is logged
        // and left UNSEEN for a human.
        if (outcome === 'defer' && !cfg.inboundAck) {
          skipped++
          await finalize({ to_email: fromAddr, subject, reply_status: 'skipped', notes: 'defer:no-ack-sent' })
          continue
        }

        const status = await sendEmail({
          to: fromAddr,
          subject: /^re:/i.test(subject) ? subject : `Re: ${subject || 'your message'}`,
          text: replyText(text, cfg.signature),
          inReplyTo: messageId || undefined,
          references: messageId || undefined,
          headers: { 'Auto-Submitted': 'auto-replied' },
        })
        if (status === 'sent') {
          replied++
          // Layer 3 — only replied-to mail is marked read.
          try { await client.messageFlagsAdd(meta.uid, ['\\Seen'], { uid: true }) } catch { /* non-fatal */ }
        }
        await finalize({ to_email: fromAddr, subject, reply_status: status, notes: outcome === 'answer' ? 'answer' : 'defer', ai_answered: outcome === 'answer' })
      } catch (e) {
        console.error('[email-responder] inbound message failed:', e?.message || e)
        try { await finalize({ reply_status: 'failed', notes: 'exception' }) } catch { /* ignore */ }
      }
    }
  } catch (e) {
    console.error('[email-responder] inbound poll failed:', e?.message || e)
    return { error: 'inbound-failed', detail: e?.message || String(e), replied, ignored, skipped, scanned }
  } finally {
    try { lock?.release() } catch { /* ignore */ }
    try { await client.logout() } catch { /* ignore */ }
  }
  return { replied, ignored, skipped, scanned }
}

// ── Lead-form polling ────────────────────────────────────────────────────────

export async function pollLeads(sb, cfg) {
  // Eligible: never auto-replied + recent (so enabling later doesn't blast a
  // backlog). Pre-existing leads were backfilled with auto_replied_at in the
  // migration, so only genuinely new rows qualify.
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: leads } = await sb.from('leads')
    .select('id, name, email, business_name, service_interest, message')
    .is('auto_replied_at', null)
    .gt('created_at', cutoff)
    .not('email', 'is', null)
    .order('created_at', { ascending: true })
    .limit(cfg.maxPerRun)

  if (!leads || !leads.length) return { replied: 0, claimed: 0 }

  const knowledge = await fetchKnowledge()
  let replied = 0, claimed = 0
  for (const lead of leads) {
    // Atomic claim (CAS) so overlapping cron runs can't double-send.
    const { data: won } = await sb.from('leads')
      .update({ auto_replied_at: new Date().toISOString() })
      .eq('id', lead.id).is('auto_replied_at', null).select('id')
    if (!won || !won.length) continue // another run claimed it
    claimed++

    try {
      const { outcome, text } = await draftReply({
        cfg, knowledge, kind: 'lead',
        fromName: lead.name, subject: 'Thanks for reaching out',
        body: lead.message, leadFields: lead,
      })
      const status = await sendEmail({
        to: lead.email,
        subject: 'Thanks for reaching out to Haze Tech Solutions',
        text: replyText(text, cfg.signature),
        headers: { 'Auto-Submitted': 'auto-replied' },
      })
      if (status === 'sent') replied++
      // Release the claim on a genuine transient send failure so a later run
      // retries (codex design note). 'skipped' (SMTP not configured) keeps the
      // claim so we don't re-draft via OpenAI on every run while it's misconfigured.
      else if (status === 'failed') await sb.from('leads').update({ auto_replied_at: null }).eq('id', lead.id)
      await logRow(sb, { source: 'lead', to_email: lead.email, subject: 'lead auto-reply', lead_id: lead.id, reply_status: status, notes: outcome, ai_answered: outcome === 'answer' })
    } catch (e) {
      console.error('[email-responder] lead reply failed:', e?.message || e)
      await sb.from('leads').update({ auto_replied_at: null }).eq('id', lead.id) // release for retry
      await logRow(sb, { source: 'lead', to_email: lead.email, lead_id: lead.id, reply_status: 'failed', notes: 'exception', ai_answered: false })
    }
  }
  return { replied, claimed }
}

// ── Orchestrator (shared by the cron and the admin "Run now" action) ─────────

export async function runOnce(sb, opts = {}) {
  const cfg = await getResponderConfig(opts)
  if (!cfg.enabled) return { enabled: false, inbound: null, leads: null }
  const inbound = cfg.inboundEnabled ? await pollInbound(sb, cfg) : { disabled: true }
  const leads = cfg.leadsEnabled ? await pollLeads(sb, cfg) : { disabled: true }
  return { enabled: true, inbound, leads }
}
