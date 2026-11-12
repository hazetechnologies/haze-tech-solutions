import { Link } from 'react-router-dom'
import LegalLayout, { Section, FromNumber } from './LegalLayout'
import { NO_SHARING_SENTENCE, SMS_SUPPORT_EMAIL, SMS_TERMS_PATH, SMS_SIGNUP_PATH } from '../../lib/smsProgram'

// Written from what the site's code does (2026-11-12): GA4 + PostHog (session
// recording with inputs masked) + Sentry on every page; leads, audits, chat,
// newsletter, portal, Stripe, affiliates, email auto-replies, text sign-ups.
// Keep it in step with the product.
export default function PrivacyPage() {
  const mail = <a href={`mailto:${SMS_SUPPORT_EMAIL}`}>{SMS_SUPPORT_EMAIL}</a>
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="November 12, 2026"
      intro={<p>This policy explains what information Haze Tech Solutions LLC (&ldquo;Haze Tech Solutions&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects through hazetechsolutions.com, our client portal and our text messages, what we do with it, who we share it with, and the choices you have. Questions go to {mail}.</p>}
    >
      <Section id="collect" title="What we collect">
        <ul>
          <li><strong>What you send us through forms.</strong> When you contact us or request a free audit: your name, email, business name, website and the details you write about your business and goals. When you join our newsletter: your email address.</li>
          <li><strong>Audits.</strong> The website or social profiles you ask us to audit, and the results.</li>
          <li><strong>Chat.</strong> The messages you type into the chat assistant on our site, and its replies.</li>
          <li><strong>Emails you send us.</strong> Your message and email address. Some replies are drafted with AI help.</li>
          <li><strong>Clients.</strong> If you become a client: your portal account (email and password, handled by our sign-in provider), your company details, project information, and the files, brand assets and website content we create for you.</li>
          <li><strong>Payments.</strong> Payments are processed by Stripe. We see what you bought, the amount and the status, but never your full card number.</li>
          <li><strong>Partner Program.</strong> If you join as a partner: your name, email, referral code, the leads you refer and the payout details you give us.</li>
          <li><strong>Text messages.</strong> If you sign up for texts or give us your mobile number to text you: your name, mobile number, the record of your consent (the wording you agreed to, when, and the IP address and browser it came from), and the messages we exchange.</li>
          <li><strong>How you use the site.</strong> Pages viewed, buttons clicked, device and browser type, approximate location from your IP address, and error reports. See &ldquo;Analytics and cookies&rdquo; below.</li>
        </ul>
      </Section>

      <Section id="use" title="How we use it">
        <p>To answer you, run audits, deliver and support the services you buy, bill you, send the emails and texts you asked for, pay partners, keep the site secure and working, and understand which parts of the site are useful so we can improve it. We may email you about our services if you contacted us or subscribed, and every such email lets you unsubscribe. We do not sell your personal information.</p>
      </Section>

      <Section id="texts" title="Text messages">
        <p>We text only people who agreed to receive texts from us: through our <Link to={SMS_SIGNUP_PATH}>text sign-up form</Link>, or by giving us their mobile number and agreeing to texts when they became a client or contact. Texts come from <FromNumber /> and are about your questions, appointments, projects and account. They are not marketing. The full terms, including how to stop them, are in our <Link to={SMS_TERMS_PATH}>Text Message Terms</Link>.</p>
        <p><strong>{NO_SHARING_SENTENCE}</strong> We do not sell, rent or share mobile numbers with anyone for their own use. Your number passes through our hosting provider (Vercel), is kept in our database (Supabase), is emailed to our team when you sign up (through our email provider, Hostinger), and is given to our phone carrier, Telnyx, to deliver the messages. They handle it only for us. The sharing described elsewhere in this policy does not include text message opt-in data and consent.</p>
        <p>Reply STOP to any text to stop receiving them, or HELP for help.</p>
      </Section>

      <Section id="share" title="Who we share it with">
        <p>Only the service providers that run our business for us, and only what each needs:</p>
        <ul>
          <li><strong>Supabase</strong>: our database, file storage and client sign-in.</li>
          <li><strong>Vercel</strong>: hosting for the site and portal.</li>
          <li><strong>Cloudflare</strong>: storage for some files and images.</li>
          <li><strong>Stripe</strong>: payments and invoices.</li>
          <li><strong>OpenAI and Anthropic</strong>: the AI models behind our chat assistant, audits, email replies and the brand and website content we create. They receive the text needed for each task.</li>
          <li><strong>Hostinger</strong>: our email.</li>
          <li><strong>Telnyx</strong>: our phone carrier, for text messages.</li>
          <li><strong>Google Analytics, PostHog and Sentry</strong>: analytics and error reporting (see below).</li>
          <li>Our own automation server, which runs follow-up emails and internal workflows.</li>
        </ul>
        <p>We may disclose information if the law requires it, or to protect the rights and safety of our clients, our business or the public. If Haze Tech Solutions is involved in a merger or sale, information may transfer as part of it, under this policy&apos;s protections.</p>
      </Section>

      <Section id="analytics" title="Analytics and cookies">
        <p>We use Google Analytics and PostHog to see how the site is used. They set cookies or similar storage in your browser and record page views, clicks and device details. PostHog may also record how you move through pages (session recordings); everything you type into form fields is hidden from those recordings. Sentry receives error reports when something on the site breaks. After you submit a form or sign in, these tools may link your activity on the site to your email address or account. Your mobile number is never sent to them.</p>
        <p>You can block or delete cookies in your browser settings, and Google offers a <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">browser add-on to opt out of Google Analytics</a>.</p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <p>We keep information while it&apos;s needed for the purpose we collected it for: client records for as long as you are a client and as long afterwards as tax and accounting rules require, and leads and messages until you ask us to delete them or they are no longer useful. We keep the record of your text message consent, and of any opt-out, for as long as we may text you and for four years afterwards, so we can show you agreed or asked us to stop.</p>
      </Section>

      <Section id="security" title="How we protect it">
        <p>Data is encrypted in transit, access to our database is limited by access rules and to the people who need it, and payment card details never reach our servers. No system is perfectly secure; if a breach affects you, we will tell you as the law requires.</p>
      </Section>

      <Section id="choices" title="Your choices and rights">
        <ul>
          <li>Reply STOP to stop texts, or use the unsubscribe link in any marketing email.</li>
          <li>Ask us for a copy of your information, to correct it, or to delete it, by emailing {mail}. We will answer within 30 days.</li>
        </ul>
        <p>Depending on where you live, you may have further rights under local law, and we will honor them.</p>
      </Section>

      <Section id="children" title="Children">
        <p>Our services are for businesses and are not directed at anyone under 18. We do not knowingly collect information from children.</p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>If we change this policy, we will update the date at the top. If a change is significant, we will say so on this page and, where we can, tell clients by email.</p>
      </Section>

      <Section id="contact" title="Contact">
        <p>Haze Tech Solutions LLC, Miami Beach, Florida. {mail}.</p>
      </Section>
    </LegalLayout>
  )
}
