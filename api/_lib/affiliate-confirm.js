// api/_lib/affiliate-confirm.js
// SafeLinks-safe email confirmation for affiliate self-signup. Instead of
// Supabase's confirmation email (unbranded + one-time links that Outlook
// SafeLinks pre-burns), we mint our own token to an /affiliate/confirm page.
// Loading that page consumes nothing; only the POST confirms the account.
import crypto from 'crypto'
import { sendEmail, wrapHtml, button, escapeHtml } from './email.js'

const SITE_URL = process.env.VITE_SITE_URL || 'https://www.hazetechsolutions.com'
const TTL_MS = 24 * 60 * 60 * 1000

// Mint a single-use confirmation token; returns the confirm URL. Invalidates the
// user's prior unused tokens so only one live link exists.
export async function mintConfirmToken(adminClient, userId, email) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expires_at = new Date(Date.now() + TTL_MS).toISOString()
  await adminClient.from('affiliate_confirm_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId).is('used_at', null)
  const { error } = await adminClient.from('affiliate_confirm_tokens')
    .insert({ token, user_id: userId, email, expires_at })
  if (error) throw new Error(error.message)
  return `${SITE_URL}/affiliate/confirm?token=${token}`
}

// Branded confirmation email over Hostinger SMTP. Best-effort (never throws).
export async function sendConfirmEmail(to, name, url) {
  const safeName = escapeHtml(name || 'there')
  const html = wrapHtml(`Confirm your email, ${safeName}`,
    `<p>Welcome to the Haze Tech <b>Partner Program</b>! Confirm your email to activate your partner account and get your referral link:</p>` +
    `${button(url, 'Confirm my email')}` +
    `<p style="color:#64748b;font-size:13px">This link is valid for 24 hours. If you didn't sign up, you can safely ignore this email.</p>`)
  return sendEmail({
    to,
    subject: 'Confirm your Haze Tech partner account',
    html,
    text: `Welcome to the Haze Tech Partner Program! Confirm your email to activate your account:\n\n${url}\n\nThis link is valid for 24 hours.`,
  })
}
