// api/_lib/notification-registry.js
// Event type -> recipients. Each recipient has an audience, an async
// resolveTo(adminClient, payload) returning the email address (or null to skip
// email / in-app only), and render(payload) returning the in-app + email copy.
import { wrapHtml } from './email.js'
import { getSetting } from './stripe.js'

const ADMIN_FALLBACK = 'info@hazetechsolutions.com'

// Resolve the admin recipient (overridable via admin_settings / env).
async function adminEmail() {
  try {
    return (await getSetting('ADMIN_NOTIFY_EMAIL', 'ADMIN_NOTIFY_EMAIL')) || ADMIN_FALLBACK
  } catch {
    return ADMIN_FALLBACK
  }
}

export const REGISTRY = {
  'client.created': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.client?.email || null,
      render: (p) => ({
        title: `Welcome to Haze Tech, ${p.client?.name || 'there'}!`,
        body: 'Your account is set up. Log in to your portal to track your projects, brand kit, and invoices.',
        link: '/portal/dashboard',
        emailSubject: 'Welcome to Haze Tech Solutions',
        emailHtml: wrapHtml('Welcome aboard 🎉', `<p>Hi ${p.client?.name || 'there'}, your Haze Tech portal is ready.</p><p>Sign in to track your projects, brand kit, and invoices.</p>`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: `New client: ${p.client?.name || p.client?.email || 'unknown'}`,
        body: `${p.client?.company || ''} (${p.client?.email || ''}) was added${p.source ? ` via ${p.source}` : ''}.`,
        link: p.client?.id ? `/admin/clients/${p.client.id}` : '/admin/clients',
        emailSubject: `New client: ${p.client?.name || p.client?.email}`,
        emailHtml: wrapHtml('New client', `<p><b>${p.client?.name || ''}</b> (${p.client?.email || ''})${p.client?.company ? ` — ${p.client.company}` : ''} was added${p.source ? ` via ${p.source}` : ''}.</p>`),
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
        emailSubject: 'Website intake submitted',
        emailHtml: wrapHtml('Intake submitted', `<p>${p.clientName || 'A client'} submitted their website intake. Generate the scaffold when ready.</p>`),
      }),
    },
  ],

  'website.done': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: () => ({
        title: 'Your website is ready 🎉',
        body: 'Your website project has finished generating. Reach out to your team for next steps.',
        link: '/portal/dashboard',
        emailSubject: 'Your website is ready',
        emailHtml: wrapHtml('Your website is ready 🎉', `<p>Good news — your website project has finished generating.</p>`),
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
        emailHtml: wrapHtml('Website generation failed', `<p>Scaffold generation failed for ${p.clientName || p.clientId}.</p><p>${p.error || ''}</p>`),
      }),
    },
  ],

  'brandkit.logos_ready': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: () => ({
        title: 'Your logos are ready to approve',
        body: 'Pick your favorite logo in the portal to kick off banner generation.',
        link: '/portal/brand-kit',
        emailSubject: 'Approve your logo',
        emailHtml: wrapHtml('Your logos are ready', `<p>Your logo options are ready. Pick your favorite in the portal to start banners.</p>`),
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
      render: () => ({
        title: 'Your brand kit is ready 🎨',
        body: 'Your full brand kit has been generated. View and download it in the portal.',
        link: '/portal/brand-kit',
        emailSubject: 'Your brand kit is ready',
        emailHtml: wrapHtml('Your brand kit is ready 🎨', `<p>Your full brand kit is done — view and download it in the portal.</p>`),
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
        body: `We received your payment${p.amount ? ` of $${p.amount}` : ''}.`,
        link: '/portal/invoices',
        emailSubject: 'Payment received',
        emailHtml: wrapHtml('Payment received', `<p>Thanks! We received your payment${p.amount ? ` of <b>$${p.amount}</b>` : ''}.</p>`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: `Payment received: ${p.clientName || p.clientEmail || ''}`,
        body: `Invoice paid${p.amount ? ` — $${p.amount}` : ''}.`,
        link: '/admin/invoices',
        emailSubject: `Payment received${p.amount ? ` — $${p.amount}` : ''}`,
        emailHtml: wrapHtml('Payment received', `<p>${p.clientName || p.clientEmail || 'A client'} paid an invoice${p.amount ? ` of <b>$${p.amount}</b>` : ''}.</p>`),
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
        emailHtml: wrapHtml('New subscription', `<p>${p.clientName || p.clientEmail || 'A client'} started a ${p.planName || ''} subscription.</p>`),
      }),
    },
  ],
}
