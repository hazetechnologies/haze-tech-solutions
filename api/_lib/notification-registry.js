// api/_lib/notification-registry.js
// Event type -> recipients. Each recipient has an audience, an async
// resolveTo(adminClient, payload) returning the email address (or null to skip
// email / in-app only), and render(payload) returning the in-app + email copy.
import { wrapHtml, button, detailTable, escapeHtml as esc } from './email.js'
import { getSetting } from './stripe.js'

const ADMIN_FALLBACK = 'info@hazetechsolutions.com'
const PORTAL_LOGIN = 'https://www.hazetechsolutions.com/portal/login'

// Resolve the admin recipient (overridable via admin_settings / env).
async function adminEmail() {
  try {
    return (await getSetting('ADMIN_NOTIFY_EMAIL', 'ADMIN_NOTIFY_EMAIL')) || ADMIN_FALLBACK
  } catch {
    return ADMIN_FALLBACK
  }
}

const money = (v) => (v == null || v === '' ? null : `$${v}`)

export const REGISTRY = {
  'client.created': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.client?.email || null,
      render: (p) => {
        const c = p.client || {}
        const table = detailTable([
          ['Company', c.company],
          ['Plan', c.product ? `${c.product}${c.price != null && c.price !== '' ? ` — ${money(c.price)}` : ''}` : null],
        ])
        // Admin-created clients get a set-password link; lead-convert clients get
        // Supabase's invite email for that, so we just point them to the portal.
        const cta = p.setPasswordUrl
          ? `<p>To get started, set your password and sign in to your client portal:</p>${button(p.setPasswordUrl, 'Set your password')}`
          : button(PORTAL_LOGIN, 'Log in to your portal')
        return {
          title: `Welcome to Haze Tech, ${c.name || 'there'}!`,
          body: `Your client portal is ready${c.company ? ` for ${c.company}` : ''}. Track your projects, brand kit, and invoices in one place.`,
          link: '/portal/dashboard',
          emailSubject: 'Welcome to Haze Tech Solutions 🎉',
          emailHtml: wrapHtml(`Welcome aboard, ${esc(c.name) || 'there'}! 🎉`,
            `<p>We're thrilled to be working with you${c.company ? ` and the team at <b>${esc(c.company)}</b>` : ''}.</p>${table}${cta}<p style="color:#94a3b8;font-size:13px;margin-top:8px">Inside your portal you can follow your website project, approve your brand kit, view invoices, and message us. Questions? Just reply to this email.</p>`),
        }
      },
    },
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => {
        const c = p.client || {}
        return {
          title: `New client: ${c.name || c.email || 'unknown'}`,
          body: `${c.company ? c.company + ' · ' : ''}${c.email || ''}${c.product ? ` · ${c.product}` : ''}${p.source ? ` (via ${p.source})` : ''}`,
          link: c.id ? `/admin/clients/${c.id}` : '/admin/clients',
          emailSubject: `New client: ${c.name || c.email}`,
          emailHtml: wrapHtml('New client added',
            `<p>A new client was added${p.source ? ` via <b>${p.source}</b>` : ''}:</p>${detailTable([
              ['Name', c.name],
              ['Email', c.email],
              ['Company', c.company],
              ['Plan', c.product ? `${c.product}${c.price != null && c.price !== '' ? ` — ${money(c.price)}` : ''}` : null],
            ])}${button(c.id ? `https://www.hazetechsolutions.com/admin/clients/${c.id}` : 'https://www.hazetechsolutions.com/admin/clients', 'Open client')}`),
        }
      },
    },
  ],

  'website.intake_requested': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: (p) => ({
        title: 'Action needed: complete your website intake',
        body: 'We\'ve started your website project — fill out the quick intake form so we can begin.',
        link: '/portal/website-intake',
        emailSubject: 'Please complete your website intake',
        emailHtml: wrapHtml(`Let's build your website, ${esc(p.clientName) || 'there'}!`,
          `<p>We've set up your website project. To get started, complete the short intake form — it covers your pages, services, and style preferences.</p>${button('https://www.hazetechsolutions.com/portal/website-intake', 'Complete intake form')}<p style="color:#94a3b8;font-size:13px">It only takes a couple of minutes. Reply here if you have any questions.</p>`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => null, // in-app only
      render: (p) => ({
        title: `Intake form sent: ${p.clientName || p.clientId}`,
        body: 'The client was asked to complete their website intake.',
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
      }),
    },
  ],

  'website.intake_submitted': [
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: 'Website intake submitted — ready to generate',
        body: `${p.clientName || 'A client'} submitted their website intake.`,
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
        emailSubject: `Website intake submitted${p.clientName ? ` — ${p.clientName}` : ''}`,
        emailHtml: wrapHtml('Intake submitted',
          `<p><b>${esc(p.clientName) || 'A client'}</b> submitted their website intake. You can generate the scaffold whenever you're ready.</p>${button(p.clientId ? `https://www.hazetechsolutions.com/admin/clients/${p.clientId}` : 'https://www.hazetechsolutions.com/admin/clients', 'Review intake')}`),
      }),
    },
  ],

  'website.done': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: (p) => ({
        title: 'Your website is ready 🎉',
        body: 'Your website project has finished generating. Reach out to your team for next steps.',
        link: '/portal/dashboard',
        emailSubject: 'Your website is ready 🎉',
        emailHtml: wrapHtml(`Great news, ${esc(p.clientName) || 'there'} — your website is ready! 🎉`,
          `<p>Your website project has finished generating. Log in to your portal to see what's next.</p>${button('https://www.hazetechsolutions.com/portal/dashboard', 'View in portal')}`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => null, // in-app only
      render: (p) => ({
        title: `Website done: ${p.clientName || p.clientId}`,
        body: 'Scaffold generation completed.',
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
      }),
    },
  ],

  'website.failed': [
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: `Website generation FAILED: ${p.clientName || p.clientId}`,
        body: p.error || 'Scaffold generation failed.',
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
        emailSubject: 'Website generation failed',
        emailHtml: wrapHtml('Website generation failed',
          `<p>Scaffold generation failed for <b>${esc(p.clientName || p.clientId)}</b>.</p>${detailTable([['Error', p.error]])}${button(p.clientId ? `https://www.hazetechsolutions.com/admin/clients/${p.clientId}` : 'https://www.hazetechsolutions.com/admin/clients', 'Open client')}`),
      }),
    },
  ],

  'brandkit.logos_ready': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: (p) => ({
        title: 'Your logos are ready to approve',
        body: 'Pick your favorite logo in the portal to kick off banner generation.',
        link: '/portal/brand-kit',
        emailSubject: 'Your logos are ready — pick your favorite',
        emailHtml: wrapHtml(`Your logo options are ready, ${esc(p.clientName) || 'there'}!`,
          `<p>We've generated your logo concepts. Choose your favorite in the portal and we'll generate the rest of your brand kit (banners, etc.) from it.</p>${button('https://www.hazetechsolutions.com/portal/brand-kit', 'Choose your logo')}`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => null,
      render: (p) => ({
        title: `Logos ready: ${p.clientName || p.clientId}`,
        body: 'Awaiting client logo approval.',
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
      }),
    },
  ],

  'brandkit.done': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: (p) => ({
        title: 'Your brand kit is ready 🎨',
        body: 'Your full brand kit has been generated. View and download it in the portal.',
        link: '/portal/brand-kit',
        emailSubject: 'Your brand kit is ready 🎨',
        emailHtml: wrapHtml(`Your brand kit is ready, ${esc(p.clientName) || 'there'}! 🎨`,
          `<p>Your complete brand kit — logos, banners, and assets — is done. View and download everything from your portal.</p>${button('https://www.hazetechsolutions.com/portal/brand-kit', 'View your brand kit')}`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => null,
      render: (p) => ({
        title: `Brand kit done: ${p.clientName || p.clientId}`,
        body: 'Brand kit generation completed.',
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
      }),
    },
  ],

  'invoice.paid': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: (p) => ({
        title: 'Payment received — thank you',
        body: `We received your payment${p.amount ? ` of ${money(p.amount)}` : ''}.`,
        link: '/portal/invoices',
        emailSubject: 'Payment received — thank you',
        emailHtml: wrapHtml(`Thank you, ${esc(p.clientName) || 'there'}!`,
          `<p>We've received your payment — thank you.</p>${detailTable([['Amount', money(p.amount)], ['Plan', p.planName]])}${button('https://www.hazetechsolutions.com/portal/invoices', 'View invoices')}`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: `Payment received: ${p.clientName || p.clientEmail || ''}`,
        body: `Invoice paid${p.amount ? ` — ${money(p.amount)}` : ''}.`,
        link: '/admin/invoices',
        emailSubject: `Payment received${p.amount ? ` — ${money(p.amount)}` : ''}`,
        emailHtml: wrapHtml('Payment received',
          `<p><b>${esc(p.clientName || p.clientEmail || 'A client')}</b> paid an invoice.</p>${detailTable([['Amount', money(p.amount)], ['Client', p.clientEmail]])}`),
      }),
    },
  ],

  'subscription.created': [
    {
      audience: 'client',
      resolveTo: async () => null, // in-app confirmation only
      render: (p) => ({
        title: 'Subscription active',
        body: `Your ${p.planName || 'subscription'} is now active.`,
        link: '/portal/services',
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: `New subscription: ${p.clientName || p.clientEmail || ''}`,
        body: `${p.planName || 'A plan'} subscription started.`,
        link: '/admin/clients',
        emailSubject: 'New subscription',
        emailHtml: wrapHtml('New subscription',
          `<p><b>${esc(p.clientName || p.clientEmail || 'A client')}</b> started a subscription.</p>${detailTable([['Plan', p.planName], ['Client', p.clientEmail]])}`),
      }),
    },
  ],
}
