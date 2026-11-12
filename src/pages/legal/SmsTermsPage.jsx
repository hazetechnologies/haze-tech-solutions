import { Link } from 'react-router-dom'
import LegalLayout, { Section, FromNumber } from './LegalLayout'
import { SMS_BRAND, SMS_LEGAL_NAME, SMS_SUPPORT_EMAIL, SMS_PURPOSE, SMS_PRIVACY_PATH, SMS_SIGNUP_PATH, NO_SHARING_SENTENCE } from '../../lib/smsProgram'

// The terms the 10DLC campaign links to. Every fact here comes from
// src/lib/smsProgram.js, the same source as the sign-up form's disclosure.
export default function SmsTermsPage() {
  const mail = <a href={`mailto:${SMS_SUPPORT_EMAIL}`}>{SMS_SUPPORT_EMAIL}</a>
  return (
    <LegalLayout
      title="Text Message Terms"
      updated="November 12, 2026"
      intro={<p>These terms cover the text messages {SMS_LEGAL_NAME} sends to its clients and contacts. By agreeing to receive our texts, you accept them.</p>}
    >
      <Section id="program" title="What you'll receive">
        <p>One-to-one texts from {SMS_BRAND}: {SMS_PURPOSE}. Each text is written or approved by our team. We do not send marketing or promotional texts.</p>
        <p>Texts come from <strong><FromNumber /></strong>.</p>
      </Section>

      <Section id="opt-in" title="How you sign up">
        <p>You can sign up on our <Link to={SMS_SIGNUP_PATH}>text sign-up page</Link> by entering your name and mobile number and checking the box to agree. Clients and business contacts can also agree to texts when they give us their mobile number. We text only people who have agreed.</p>
        <p>Agreeing to texts is not a condition of buying anything from us.</p>
      </Section>

      <Section id="frequency" title="How often, and what it costs">
        <p>Message frequency varies with your project and how often you write to us. Message and data rates may apply, according to your mobile plan.</p>
      </Section>

      <Section id="stop" title="How to stop texts, and get help">
        <ul>
          <li>Reply <strong>STOP</strong> to any text to stop receiving them. You&apos;ll get one text confirming you&apos;re unsubscribed, and no more after that. STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT work too.</li>
          <li>Reply <strong>START</strong> to sign up again.</li>
          <li>Reply <strong>HELP</strong> for help, or email {mail}.</li>
        </ul>
      </Section>

      <Section id="carriers" title="Carriers">
        <p>Supported on major US carriers. Carriers are not liable for delayed or undelivered messages.</p>
      </Section>

      <Section id="privacy" title="Your privacy">
        <p>{NO_SHARING_SENTENCE} How we handle your number and messages is described in our <Link to={SMS_PRIVACY_PATH}>Privacy Policy</Link>.</p>
      </Section>

      <Section id="changes" title="Changes">
        <p>We may update these terms. We&apos;ll change the date at the top, and if a change affects what we text you about, we&apos;ll tell you by text before it applies.</p>
      </Section>

      <Section id="contact" title="Contact">
        <p>{SMS_LEGAL_NAME}, Miami Beach, Florida. {mail}.</p>
      </Section>
    </LegalLayout>
  )
}
