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

// Branded HTML wrapper. Keep inline styles — many clients strip <style>.
export function wrapHtml(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#0b1120;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="font-weight:700;font-size:18px;color:#00CFFF;letter-spacing:.06em">HAZE TECH SOLUTIONS</div>
    <div style="margin-top:16px;background:#0f172a;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:24px;color:#e2e8f0;font-size:14px;line-height:1.6">
      <h1 style="margin:0 0 12px;font-size:18px;color:#f1f5f9">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="margin-top:16px;color:#475569;font-size:11px">Haze Tech Solutions · info@hazetechsolutions.com</div>
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
