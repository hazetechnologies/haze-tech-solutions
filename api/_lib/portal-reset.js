// api/_lib/portal-reset.js
// SafeLinks-safe portal password reset / invite. Instead of Supabase's one-time
// recovery links (which email scanners like Outlook SafeLinks pre-fetch and burn
// before the user clicks), we mint our own token to a /portal/reset page. Loading
// that page consumes nothing; only submitting the form sets the password.
import crypto from 'crypto'
import { sendEmail, wrapHtml, button, escapeHtml } from './email.js'

const SITE_URL = process.env.VITE_SITE_URL || 'https://www.hazetechsolutions.com'
const TTL_MS = 24 * 60 * 60 * 1000

// Create a single-use reset token for a user; returns the reset URL.
// Invalidates the user's prior unused tokens so only one live link exists.
export async function mintResetToken(adminClient, userId, email) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expires_at = new Date(Date.now() + TTL_MS).toISOString()
  await adminClient.from('portal_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId).is('used_at', null)
  const { error } = await adminClient.from('portal_reset_tokens')
    .insert({ token, user_id: userId, email, expires_at })
  if (error) throw new Error(error.message)
  return `${SITE_URL}/portal/reset?token=${token}`
}

// Branded reset/invite email over Hostinger SMTP. Best-effort (sendEmail never throws).
export async function sendResetEmail(to, name, url, { invite = false } = {}) {
  const safeName = escapeHtml(name || 'there')
  const title = invite ? `Welcome to Haze Tech, ${safeName}!` : 'Set your password'
  const intro = invite
    ? 'Your client portal is ready. Set your password to get started:'
    : 'We received a request to set the password for your Haze Tech client portal. Choose a new password below:'
  const html = wrapHtml(title,
    `<p>${intro}</p>${button(url, 'Set your password')}` +
    `<p style="color:#64748b;font-size:13px">This link is valid for 24 hours. If you didn't request this, you can safely ignore this email.</p>`)
  return sendEmail({
    to,
    subject: invite ? 'Welcome to Haze Tech Solutions 🎉' : 'Set your Haze Tech password',
    html,
    text: `${intro}\n\n${url}\n\nThis link is valid for 24 hours.`,
  })
}
