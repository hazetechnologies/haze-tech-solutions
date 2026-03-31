import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import emailjs from '@emailjs/browser'
import { Send, CheckCircle, AlertCircle, Mail, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'

// EmailJS credentials
const SERVICE_ID = 'service_4uzwhit'
const TEMPLATE_ID = 'template_oznyojk'
const PUBLIC_KEY = 'C2wRIWiA_TNE1S9mZ'

const INITIAL_FORM = {
  name: '',
  email: '',
  business: '',
  service: '',
  message: '',
  website: '',
  goals: '',
  industry: '',
  repetitive_task: '',
  payment_process: '',
  vendor_process: '',
}

export default function Contact() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('')

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('loading')

    // If EmailJS env vars aren't configured, log gracefully and show success UI
    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
      console.warn(
        'EmailJS is not configured. Add VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY to your .env file.'
      )
      console.log('Form submission data:', form)
      setTimeout(() => setStatus('success'), 600)
      return
    }

    try {
      // Save lead to Supabase
      const leadData = {
        name: form.name,
        email: form.email,
        business_name: form.business,
        service_interest: form.service,
        message: form.message,
        source: 'contact',
      }
      // Add AI Automation fields if that service was selected
      if (form.service === 'AI Automation' || form.service === 'All Three') {
        leadData.website = form.website || null
        leadData.goals = form.goals || null
        leadData.industry = form.industry || null
        leadData.repetitive_task = form.repetitive_task || null
        leadData.payment_process = form.payment_process || null
        leadData.vendor_process = form.vendor_process || null
      }
      supabase.from('leads').insert(leadData).select().single().then(({ data, error }) => {
        if (error) { console.error('Supabase lead save error:', error); return }
        // Trigger lead nurture email sequence
        fetch('https://n8n.srv934577.hstgr.cloud/webhook/lead-nurture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, email: form.email, service: form.service }),
        }).catch(console.error)
        // If AI Automation, generate automation report via our serverless function
        if (data && (form.service === 'AI Automation' || form.service === 'All Three')) {
          fetch('/api/generate-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...leadData, lead_id: data.id }),
          }).catch(console.error)
        }
      })

      await emailjs.send(
        SERVICE_ID,
        TEMPLATE_ID,
        {
          from_name: form.name,
          from_email: form.email,
          business_name: form.business,
          service_interest: form.service,
          message: form.message,
        },
        { publicKey: PUBLIC_KEY }
      )
      setStatus('success')
      setForm(INITIAL_FORM)
    } catch (err) {
      console.error('EmailJS error:', err)
      setErrorMsg(err?.text || err?.message || JSON.stringify(err) || 'Unknown error')
      setStatus('error')
    }
  }

  const inputBase = {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(0, 207, 255, 0.15)',
    borderRadius: 8,
    color: '#F1F5F9',
    padding: '0.75rem 1rem',
    width: '100%',
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    fontSize: '0.95rem',
    transition: 'all 0.2s ease',
    outline: 'none',
  }

  return (
    <section
      id="contact"
      className="relative py-28 px-6 overflow-hidden"
      style={{ background: '#071526' }}
      aria-label="Contact us"
    >
      {/* Border top */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(to right, transparent, rgba(0,212,255,0.3), transparent)' }}
        aria-hidden="true"
      />

      {/* Orbs */}
      <div
        className="orb orb-violet"
        style={{ width: 450, height: 450, top: '-5%', right: '-10%', opacity: 0.6 }}
        aria-hidden="true"
      />
      <div
        className="orb orb-cyan"
        style={{ width: 350, height: 350, bottom: '5%', left: '-10%', opacity: 0.4 }}
        aria-hidden="true"
      />

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="section-label">Get Started</span>
          <h2
            className="font-display font-black mt-4 mb-4 text-text-main"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.1 }}
          >
            Ready to Automate{' '}
            <span className="gradient-text">Your Growth?</span>
          </h2>
          <p className="text-muted text-lg max-w-lg mx-auto">
            Tell us about your business and we'll show you exactly where AI automation,
            better marketing, or a new website could make the biggest difference.
          </p>
        </motion.div>

        {/* Form card */}
        <motion.div
          className="glass-card p-8 md:p-10 relative"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <AnimatePresence mode="wait">
            {status === 'success' ? (
              /* Success state */
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-12"
              >
                <motion.div
                  animate={{ scale: [0, 1.15, 1] }}
                  transition={{ duration: 0.5 }}
                  className="flex justify-center mb-5"
                >
                  <CheckCircle size={56} style={{ color: '#22c55e' }} aria-hidden="true" />
                </motion.div>
                <h3 className="font-display font-bold text-text-main text-2xl mb-3">
                  Message Sent!
                </h3>
                <p className="text-muted">
                  We'll review your details and get back to you within 24 hours.
                  Check your inbox — something good is coming.
                </p>
                <button
                  onClick={() => setStatus('idle')}
                  className="mt-6 text-sm text-primary hover:text-white transition-colors"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                >
                  Send another message
                </button>
              </motion.div>
            ) : (
              /* Form */
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
                aria-label="Contact form"
              >
                {/* Name + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label
                      htmlFor="name"
                      className="block text-sm font-medium text-muted mb-2"
                    >
                      Full Name <span className="text-primary" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="name"
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Jane Smith"
                      required
                      style={inputBase}
                      aria-required="true"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-muted mb-2"
                    >
                      Email Address <span className="text-primary" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="jane@company.com"
                      required
                      style={inputBase}
                      aria-required="true"
                    />
                  </div>
                </div>

                {/* Business + Service */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label
                      htmlFor="business"
                      className="block text-sm font-medium text-muted mb-2"
                    >
                      Business Name <span className="text-primary" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="business"
                      type="text"
                      name="business"
                      value={form.business}
                      onChange={handleChange}
                      placeholder="Acme Co."
                      required
                      style={inputBase}
                      aria-required="true"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="service"
                      className="block text-sm font-medium text-muted mb-2"
                    >
                      Service of Interest <span className="text-primary" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="service"
                      name="service"
                      value={form.service}
                      onChange={handleChange}
                      required
                      style={{ ...inputBase, cursor: 'pointer' }}
                      aria-required="true"
                    >
                      <option value="" disabled style={{ background: '#071526' }}>
                        Select a service…
                      </option>
                      <option value="AI Automation" style={{ background: '#071526' }}>
                        AI Automation
                      </option>
                      <option value="Social Media Marketing" style={{ background: '#071526' }}>
                        Social Media Marketing
                      </option>
                      <option value="Website Development" style={{ background: '#071526' }}>
                        Website Development
                      </option>
                      <option value="All Three" style={{ background: '#071526' }}>
                        All Three — Full Package
                      </option>
                    </select>
                  </div>
                </div>

                {/* AI Automation extra fields */}
                <AnimatePresence>
                  {(form.service === 'AI Automation' || form.service === 'All Three') && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div
                        className="space-y-5"
                        style={{
                          background: 'rgba(0, 207, 255, 0.04)',
                          border: '1px solid rgba(0, 207, 255, 0.12)',
                          borderRadius: 12,
                          padding: '1.25rem',
                          marginBottom: '1.25rem',
                        }}
                      >
                        <p style={{ fontSize: '0.8rem', color: '#00CFFF', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 0.75rem' }}>
                          AI Automation Details
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div>
                            <label htmlFor="website" className="block text-sm font-medium text-muted mb-2">
                              Website URL
                            </label>
                            <input
                              id="website" type="url" name="website"
                              value={form.website} onChange={handleChange}
                              placeholder="https://yoursite.com"
                              style={inputBase}
                            />
                          </div>
                          <div>
                            <label htmlFor="industry" className="block text-sm font-medium text-muted mb-2">
                              Industry
                            </label>
                            <input
                              id="industry" type="text" name="industry"
                              value={form.industry} onChange={handleChange}
                              placeholder="e.g. Real Estate, E-commerce, Healthcare"
                              style={inputBase}
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="goals" className="block text-sm font-medium text-muted mb-2">
                            What are your goals?
                          </label>
                          <textarea
                            id="goals" name="goals"
                            value={form.goals} onChange={handleChange}
                            placeholder="e.g. Save time on follow-ups, automate invoicing, reduce manual data entry..."
                            rows={2}
                            style={{ ...inputBase, resize: 'vertical' }}
                          />
                        </div>

                        <div>
                          <label htmlFor="repetitive_task" className="block text-sm font-medium text-muted mb-2">
                            What repetitive tasks do you want automated? <span className="text-primary">*</span>
                          </label>
                          <textarea
                            id="repetitive_task" name="repetitive_task"
                            value={form.repetitive_task} onChange={handleChange}
                            placeholder="e.g. Manually sending follow-up emails, copying data between spreadsheets, scheduling appointments..."
                            rows={3}
                            style={{ ...inputBase, resize: 'vertical' }}
                          />
                        </div>

                        <div>
                          <label htmlFor="payment_process" className="block text-sm font-medium text-muted mb-2">
                            How does your business get paid?
                          </label>
                          <textarea
                            id="payment_process" name="payment_process"
                            value={form.payment_process} onChange={handleChange}
                            placeholder="e.g. Invoices via QuickBooks, Stripe checkout, manual bank transfers..."
                            rows={2}
                            style={{ ...inputBase, resize: 'vertical' }}
                          />
                        </div>

                        <div>
                          <label htmlFor="vendor_process" className="block text-sm font-medium text-muted mb-2">
                            How do you pay vendors and employees?
                          </label>
                          <textarea
                            id="vendor_process" name="vendor_process"
                            value={form.vendor_process} onChange={handleChange}
                            placeholder="e.g. Gusto payroll, manual checks, Venmo, direct deposit..."
                            rows={2}
                            style={{ ...inputBase, resize: 'vertical' }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Message */}
                <div>
                  <label
                    htmlFor="message"
                    className="block text-sm font-medium text-muted mb-2"
                  >
                    Tell Us About Your Business
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    placeholder="What are you working on? What's your biggest challenge right now?"
                    rows={5}
                    style={{ ...inputBase, resize: 'vertical', minHeight: 120 }}
                  />
                </div>

                {/* Error banner */}
                {status === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg"
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                    }}
                    role="alert"
                  >
                    <AlertCircle size={16} style={{ color: '#ef4444' }} aria-hidden="true" />
                    <span className="text-sm text-red-400">
                      Something went wrong. Please try again or email us directly.
                    </span>
                  </motion.div>
                )}

                {/* Submit button */}
                <motion.button
                  type="submit"
                  disabled={status === 'loading'}
                  className="btn-primary w-full justify-center text-sm"
                  whileHover={status !== 'loading' ? { scale: 1.02 } : {}}
                  whileTap={status !== 'loading' ? { scale: 0.98 } : {}}
                  style={status === 'loading' ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                >
                  {status === 'loading' ? (
                    <>
                      <svg
                        className="animate-spin"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <circle
                          cx="12" cy="12" r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeOpacity="0.3"
                        />
                        <path
                          d="M12 2a10 10 0 0 1 10 10"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                      Sending…
                    </>
                  ) : (
                    <>
                      Send Message
                      <Send size={15} aria-hidden="true" />
                    </>
                  )}
                </motion.button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Below form info */}
        <motion.div
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-muted"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2">
            <Mail size={15} style={{ color: '#00CFFF' }} aria-hidden="true" />
            <a
              href="mailto:hello@hazetechsolutions.com"
              className="hover:text-primary transition-colors"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              hello@hazetechsolutions.com
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={15} style={{ color: '#FF6B00' }} aria-hidden="true" />
            <span>We respond within 24 hours</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
