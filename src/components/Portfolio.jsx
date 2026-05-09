import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Users, BarChart3, ArrowUpRight, Play } from 'lucide-react'
import { supabase } from '../lib/supabase'

const SERVICE_META = {
  'AI Automation': { color: '#00CFFF', icon: TrendingUp },
  'Social Media':  { color: '#FF6B00', icon: Users },
  'Website Dev':   { color: '#00CFFF', icon: BarChart3 },
}
const FALLBACK_META = { color: '#94A3B8', icon: TrendingUp }

function serviceMeta(tag) {
  return SERVICE_META[tag] || FALLBACK_META
}

// Pull a YouTube video id from any common URL shape (watch?v=, youtu.be/, /embed/, /shorts/).
function youtubeId(url) {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/)
  return m ? m[1] : null
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}

export default function Portfolio() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('portfolio_items')
        .select('id, title, client, industry, problem, result, service_tag, type, youtube_url, image_url')
        .eq('published', true)
        .order('display_order', { ascending: true })
      if (cancelled) return
      // Surface fetch errors to the console — silently rendering an empty section
      // would hide a real problem (RLS misconfig, missing column, network failure).
      if (error) console.error('[Portfolio] failed to load items:', error)
      setItems(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Hide section entirely if there are no published items — better than an empty grid.
  if (!loading && items.length === 0) return null

  return (
    <section
      id="portfolio"
      className="relative py-28 px-6 overflow-hidden"
      style={{ background: '#071526' }}
      aria-label="Portfolio and case studies"
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(to right, transparent, rgba(0,207,255,0.3), transparent)' }}
        aria-hidden="true"
      />

      <div
        className="orb orb-cyan"
        style={{ width: 500, height: 500, bottom: '-10%', left: '-10%', opacity: 0.5 }}
        aria-hidden="true"
      />

      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="section-label">Case Studies</span>
          <h2
            className="font-display font-black mt-4 mb-4 text-text-main"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.1 }}
          >
            Real Businesses.{' '}
            <span className="gradient-text">Real Results.</span>
          </h2>
          <p className="text-muted text-lg max-w-xl mx-auto">
            Here's what happens when small businesses get enterprise-grade tools
            working for them around the clock.
          </p>
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="glass-card overflow-hidden flex flex-col"
                style={{ background: 'rgba(4, 13, 26, 0.6)', minHeight: 320 }}
              >
                <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ height: 14, width: '40%', background: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ height: 18, width: '70%', background: 'rgba(255,255,255,0.06)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
                <div className="px-6 py-5 flex-1">
                  {[80, 100, 90, 60].map((w, j) => (
                    <div key={j} style={{ height: 12, width: w + '%', background: 'rgba(255,255,255,0.05)', borderRadius: 6, marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
          >
            {items.map((item) => {
              const { color, icon: Icon } = serviceMeta(item.service_tag)
              const ytId = item.type === 'video' ? youtubeId(item.youtube_url) : null

              return (
                <motion.article
                  key={item.id}
                  variants={cardVariants}
                  whileHover={{
                    y: -6,
                    boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 30px ${color}1A`,
                  }}
                  className="glass-card overflow-hidden flex flex-col"
                  style={{
                    background: 'rgba(4, 13, 26, 0.6)',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {/* Optional media — YouTube embed wins over image when both exist */}
                  {ytId ? (
                    <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, background: '#000' }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId}`}
                        title={item.title}
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                      />
                    </div>
                  ) : item.image_url ? (
                    <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, background: '#020817', overflow: 'hidden' }}>
                      <img
                        src={item.image_url}
                        alt={item.title}
                        loading="lazy"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {item.type === 'video' && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                          <Play size={42} color="#FFF" />
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Card header */}
                  <div
                    className="px-6 py-5 flex items-start justify-between"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      background: `linear-gradient(135deg, ${color}08, transparent)`,
                    }}
                  >
                    <div>
                      {item.service_tag && (
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs font-display font-semibold px-2 py-0.5 rounded"
                            style={{
                              color,
                              background: `${color}15`,
                              border: `1px solid ${color}30`,
                            }}
                          >
                            {item.service_tag}
                          </span>
                        </div>
                      )}
                      <h3 className="font-display font-bold text-text-main text-base">
                        {item.client || item.title}
                      </h3>
                      {item.industry && <p className="text-muted text-xs mt-0.5">{item.industry}</p>}
                    </div>
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: `${color}15`,
                        border: `1px solid ${color}25`,
                      }}
                    >
                      <Icon size={18} style={{ color }} aria-hidden="true" />
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-6 py-5 flex-1 flex flex-col">
                    {item.problem && (
                      <p className="text-muted text-sm leading-relaxed mb-5">
                        <span className="text-white/50 font-medium">Challenge: </span>
                        {item.problem}
                      </p>
                    )}

                    {item.result && (
                      <div
                        className="rounded-xl p-4 mt-auto"
                        style={{ background: `${color}08`, border: `1px solid ${color}18` }}
                      >
                        <p className="text-sm text-text-main/85 leading-snug">
                          {item.result}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.article>
              )
            })}
          </motion.div>
        )}

        {/* Bottom CTA */}
        <motion.div
          className="text-center mt-14"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-muted text-sm mb-4">
            Ready to become our next success story?
          </p>
          <motion.button
            onClick={() => {
              const el = document.querySelector('#contact')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
            className="btn-primary inline-flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            Start Your Project
            <ArrowUpRight size={16} aria-hidden="true" />
          </motion.button>
        </motion.div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(to right, transparent, rgba(255,107,0,0.3), transparent)' }}
        aria-hidden="true"
      />
    </section>
  )
}
