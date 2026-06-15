// api/_lib/lead-confirm.js
// Branded "thanks, we'll be in touch" confirmation email to a prospect who
// submitted a lead (contact form, audit, social audit, or affiliate landing).
// Best-effort over Hostinger SMTP — sendEmail never throws.
import { sendEmail, wrapHtml, button, escapeHtml } from './email.js'

export async function sendLeadConfirmation(to, name) {
  if (!to) return
  const safe = escapeHtml(name || 'there')
  const html = wrapHtml(`Thanks for reaching out, ${safe}!`,
    `<p>We received your request and a Haze Tech Solutions specialist will be in touch within one business day.</p>
     <p>While you wait, here's how we help small businesses grow — all under one roof:</p>
     <ul style="color:#cbd5e1;font-size:14px;line-height:1.9;padding-left:18px;margin:8px 0 4px">
       <li><b>AI Automation</b> — handle the busywork 24/7</li>
       <li><b>Social Media Marketing</b> — grow on autopilot</li>
       <li><b>Website Development</b> — sites built to convert</li>
       <li><b>SEO &amp; Digital Marketing</b> — get found and chosen</li>
     </ul>
     ${button('https://www.hazetechsolutions.com', 'Explore Haze Tech')}
     <p style="color:#64748b;font-size:13px;margin-top:8px">Questions in the meantime? Just reply to this email — it comes straight to our team.</p>`)
  return sendEmail({
    to,
    subject: "Thanks for reaching out — Haze Tech Solutions",
    html,
    text: `Thanks for reaching out, ${name || 'there'}!\n\nWe received your request and a Haze Tech Solutions specialist will be in touch within one business day.\n\nWe help small businesses with AI automation, social media marketing, websites, and SEO.\n\nQuestions? Just reply to this email.\n\nhazetechsolutions.com`,
  })
}
