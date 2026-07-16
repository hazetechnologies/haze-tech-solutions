import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, Calendar } from 'lucide-react'
import { supabase } from '../lib/supabase'

const ACCENT = '#00CFFF'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}

// "Latest from the Blog" — the 3 newest published posts, rendered at the bottom
// of the homepage. Hidden entirely while empty (same convention as Portfolio).
export default function LatestBlog() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, cover_image_url, category, created_at')
        .eq('published', true)
        .order('created_at', { ascending: false })
        .limit(3)
      if (cancelled) return
      // Surface fetch errors — silently rendering nothing would hide a real
      // problem (RLS misconfig, missing column, network failure).
      if (error) console.error('[LatestBlog] failed to load posts:', error)
      setPosts(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Hide the whole section until there is something to show.
  if (loading || posts.length === 0) return null

  return (
    <section
      id="latest-blog"
      className="relative py-28 px-6 overflow-hidden"
      style={{ background: '#071526' }}
      aria-label="Latest blog posts"
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(to right, transparent, rgba(0,207,255,0.3), transparent)' }}
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
          <span className="section-label">Insights</span>
          <h2
            className="font-display font-black mt-4 mb-4 text-text-main"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.1 }}
          >
            Latest from the <span className="gradient-text">Blog</span>
          </h2>
          <p className="text-muted text-lg max-w-xl mx-auto">
            Practical guides on web, AI, and marketing — written for business owners, not engineers.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {posts.map((post) => (
            <motion.article
              key={post.id}
              variants={cardVariants}
              whileHover={{
                y: -6,
                boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 30px ${ACCENT}1A`,
              }}
              className="glass-card overflow-hidden flex flex-col"
              style={{ background: 'rgba(4, 13, 26, 0.6)', transition: 'all 0.3s ease' }}
            >
              <Link
                to={`/blog/${post.slug}`}
                aria-label={`Read: ${post.title}`}
                className="flex flex-col flex-1"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {post.cover_image_url && (
                  <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, background: '#020817', overflow: 'hidden' }}>
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      loading="lazy"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}

                <div className="px-6 py-5 flex-1 flex flex-col">
                  {post.category && (
                    <span
                      className="text-xs font-display font-semibold px-2 py-0.5 rounded self-start mb-3"
                      style={{ color: ACCENT, background: `${ACCENT}15`, border: `1px solid ${ACCENT}30` }}
                    >
                      {post.category}
                    </span>
                  )}
                  <h3 className="font-display font-bold text-text-main text-base mb-2">
                    {post.title}
                  </h3>
                  {post.excerpt && (
                    <p
                      className="text-muted text-sm leading-relaxed mb-4"
                      style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {post.excerpt}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-auto text-muted text-xs">
                    <Calendar size={13} aria-hidden="true" />
                    <span>{fmtDate(post.created_at)}</span>
                  </div>
                </div>
              </Link>
            </motion.article>
          ))}
        </motion.div>

        <motion.div
          className="text-center mt-14"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <Link to="/blog" className="btn-primary inline-flex items-center gap-2">
            View all posts
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
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
