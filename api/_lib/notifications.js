// api/_lib/notifications.js
// emitNotification: registry lookup -> insert a notifications row per recipient
// + best-effort email. Safe to call from any request path; never throws.
import { REGISTRY } from './notification-registry.js'
import { sendEmail } from './email.js'

// adminClient: a service-role Supabase client (bypasses RLS for the insert).
export async function emitNotification(adminClient, eventType, payload = {}) {
  const recipients = REGISTRY[eventType]
  if (!recipients) {
    console.warn(`[notifications] unknown event type: ${eventType}`)
    return
  }
  for (const r of recipients) {
    try {
      const c = r.render(payload)
      const to = typeof r.resolveTo === 'function' ? await r.resolveTo(adminClient, payload) : null

      let email_status = null
      if (to) {
        email_status = await sendEmail({
          to,
          subject: c.emailSubject || c.title,
          html: c.emailHtml,
          text: c.body,
        })
      } else if (c.emailSubject) {
        // Recipient has an email template but resolveTo returned no address.
        email_status = 'skipped'
      }

      await adminClient.from('notifications').insert({
        audience: r.audience,
        client_id: payload.clientId || payload.client?.id || null,
        type: eventType,
        title: c.title,
        body: c.body,
        link: c.link || null,
        payload,
        email_status,
      })
    } catch (e) {
      // Isolate per-recipient failures — one bad send/insert never blocks others.
      console.error(`[notifications] ${eventType} recipient failed:`, e?.message || e)
    }
  }
}
