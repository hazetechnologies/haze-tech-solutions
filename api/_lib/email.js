// api/_lib/email.js
// First-party transactional email over Hostinger SMTP. Credentials are read
// DB-first (admin_settings) with env fallback, matching api/_lib/stripe.js.
// IMPORTANT: From MUST equal the authenticated SMTP_USER exactly — Hostinger
// returns 553 at RCPT for alias From addresses (memory: hostinger_smtp_from).
import nodemailer from 'nodemailer'
import { getSetting } from './stripe.js'

let cached = null // { transporter, from } — reused across invocations in a warm lambda

async function getTransport() {
  if (cached) return cached
  const host = await getSetting('SMTP_HOST', 'SMTP_HOST')
  const port = parseInt((await getSetting('SMTP_PORT', 'SMTP_PORT')) || '465', 10)
  const user = await getSetting('SMTP_USER', 'SMTP_USER')
  const pass = await getSetting('SMTP_PASS', 'SMTP_PASS')
  if (!host || !user || !pass) {
    return null // not configured — caller treats as skip
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  cached = { transporter, from: user }
  return cached
}

// A branded CTA button for use inside email bodies. Returns '' when href is falsy.
export function button(href, label) {
  if (!href) return ''
  return `<table cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="border-radius:9px;background:#00CFFF">
    <a href="${href}" style="display:inline-block;padding:13px 24px;color:#021018;text-decoration:none;border-radius:9px;font-weight:700;font-size:14px">${label}</a>
  </td></tr></table>`
}

// A small key/value detail table (e.g. plan, price, company). rows = [[label, value], …]
export function detailTable(rows) {
  const body = (rows || []).filter(([, v]) => v != null && v !== '').map(
    ([k, v]) => `<tr><td style="color:#94a3b8;padding:5px 16px 5px 0;font-size:13px;white-space:nowrap">${k}</td><td style="color:#f1f5f9;font-size:13px">${v}</td></tr>`
  ).join('')
  return body ? `<table cellpadding="0" cellspacing="0" style="margin:12px 0 4px">${body}</table>` : ''
}

// Branded HTML wrapper. Keep inline styles — many clients strip <style>.
export function wrapHtml(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#0b1120;font-family:-apple-system,'Segoe UI',Arial,sans-serif">
  <div style="max-width:580px;margin:0 auto;padding:24px">
    <div style="padding:6px 2px 16px">
      <span style="font-weight:800;font-size:20px;color:#00CFFF;letter-spacing:.04em">HAZE TECH</span>
      <span style="color:#64748b;font-size:12px;letter-spacing:.12em">SOLUTIONS</span>
    </div>
    <div style="background:#0f172a;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:28px;color:#e2e8f0;font-size:15px;line-height:1.65">
      <h1 style="margin:0 0 14px;font-size:21px;color:#f8fafc">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="margin-top:18px;color:#64748b;font-size:12px;line-height:1.7;text-align:center">
      Haze Tech Solutions — AI Automation · Web Development · Social · SEO<br/>
      <a href="mailto:info@hazetechsolutions.com" style="color:#7dd3fc;text-decoration:none">info@hazetechsolutions.com</a>
      &nbsp;·&nbsp;
      <a href="https://www.hazetechsolutions.com" style="color:#7dd3fc;text-decoration:none">hazetechsolutions.com</a>
    </div>
  </div></body></html>`
}

// Best-effort send. Never throws; returns a status string the caller records.
// Returns 'sent' | 'failed' | 'skipped'.
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return 'skipped'
  let t
  try { t = await getTransport() } catch { return 'failed' }
  if (!t) return 'skipped' // SMTP not configured
  try {
    await t.transporter.sendMail({
      from: t.from,
      to,
      subject,
      text: text || subject,
      html: html || wrapHtml(subject, `<p>${subject}</p>`),
    })
    return 'sent'
  } catch (e) {
    console.error('[email] send failed:', e?.message || e)
    return 'failed'
  }
}
