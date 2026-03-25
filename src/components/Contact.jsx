import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import emailjs from '@emailjs/browser'
import { Send, CheckCircle, AlertCircle, Mail, Clock } from 'lucide-react'

// EmailJS credentials come from env vars — add them to a .env file
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

const INITIAL_FORM = {
  name: '',
  email: '',
  business: '',
  service: '',
  message: '',
}

export default function Contact() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [status, setStatus] = useState('idle') // idle | loading | success | error

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
      setStatus(err?.text || err?.message || JSON.stringify(err) || 'error')
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
                      Error: {status}
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
