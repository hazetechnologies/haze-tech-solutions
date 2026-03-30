import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'

export default function BlogPost() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [nlEmail, setNlEmail] = useState('')
  const [nlDone, setNlDone] = useState(false)

  useEffect(() => {
    supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .single()
      .then(({ data }) => {
        setPost(data)
        setLoading(false)
      })
  }, [slug])

  const handleSubscribe = async (e) => {
    e.preventDefault()
    if (!nlEmail.trim()) return
    await supabase.from('newsletter_subscribers').insert({ email: nlEmail.trim(), source: 'blog_post' }).catch(() => {})
    setNlDone(true)
    setNlEmail('')
  }

  if (loading) return (
    <div style={{ background: '#040D1A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(0,207,255,0.2)', borderTopColor: '#00CFFF', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (!post) return (
    <div style={{ background: '#040D1A', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#E8F4FF', padding: '2rem' }}>
      <Link to="/blog" style={{ color: '#94A3B8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
        <ArrowLeft size={16} /> Back to Blog
      </Link>
      <h1 style={{ fontSize: '1.5rem' }}>Post not found</h1>
    </div>
  )

  const readTime = Math.max(1, Math.ceil((post.content || '').split(/\s+/).length / 200))

  return (
    <div style={{ background: '#040D1A', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#E8F4FF' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
        .blog-content h1 { font-size: 1.8rem; font-weight: 800; margin: 2rem 0 1rem; color: #E8F4FF; }
        .blog-content h2 { font-size: 1.4rem; font-weight: 700; margin: 1.75rem 0 0.75rem; color: #E8F4FF; }
        .blog-content h3 { font-size: 1.15rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: #E8F4FF; }
        .blog-content p { margin: 0 0 1rem; line-height: 1.8; color: #8BA8C4; }
        .blog-content a { color: #00CFFF; text-decoration: underline; }
        .blog-content ul, .blog-content ol { margin: 0 0 1rem; padding-left: 1.5rem; color: #8BA8C4; line-height: 1.8; }
        .blog-content blockquote { border-left: 3px solid #00CFFF; margin: 1.5rem 0; padding: 0.5rem 1.25rem; background: rgba(0,207,255,0.04); border-radius: 0 8px 8px 0; }
        .blog-content blockquote p { color: #E8F4FF; font-style: italic; margin: 0; }
        .blog-content img { max-width: 100%; border-radius: 12px; margin: 1rem 0; }
        .blog-content strong { color: #E8F4FF; }
      `}</style>

      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(4,13,26,0.9)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(0,207,255,0.1)',
        padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/blog" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94A3B8', textDecoration: 'none', fontSize: '0.9rem' }}>
          <ArrowLeft size={16} /> Back to Blog
        </Link>
      </nav>

      {/* Cover image */}
      {post.cover_image_url && (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem 0' }}>
          <img src={post.cover_image_url} alt={post.title} style={{ width: '100%', height: 'auto', maxHeight: '400px', objectFit: 'cover', borderRadius: 16 }} />
        </div>
      )}

      {/* Article */}
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}
      >
        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#8BA8C4' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Calendar size={13} />
            {new Date(post.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Clock size={13} />
            {readTime} min read
          </span>
        </div>

        <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 900, margin: '0 0 2rem', lineHeight: 1.2 }}>
          {post.title}
        </h1>

        {/* Content */}
        <div className="blog-content" dangerouslySetInnerHTML={{ __html: post.content }} />

        {/* Newsletter CTA */}
        <div style={{
          marginTop: '3rem', padding: '2rem',
          background: 'rgba(0,207,255,0.04)',
          border: '1px solid rgba(0,207,255,0.15)',
          borderRadius: 16, textAlign: 'center',
        }}>
          <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Enjoyed this post?
          </h3>
          <p style={{ color: '#8BA8C4', fontSize: '0.9rem', margin: '0 0 1rem' }}>
            Get more insights delivered to your inbox.
          </p>
          {nlDone ? (
            <p style={{ color: '#22c55e', fontWeight: 600, fontSize: '0.9rem' }}>You're subscribed!</p>
          ) : (
            <form onSubmit={handleSubscribe} style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', maxWidth: '400px', margin: '0 auto' }}>
              <input
                type="email" value={nlEmail} onChange={e => setNlEmail(e.target.value)}
                placeholder="you@email.com" required
                style={{
                  flex: 1, padding: '0.6rem 1rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(0,207,255,0.15)',
                  borderRadius: 8, color: '#F1F5F9', fontSize: '0.9rem',
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button type="submit" style={{
                padding: '0.6rem 1.25rem',
                background: 'linear-gradient(135deg, #00CFFF, #0099CC)',
                border: 'none', borderRadius: 8, color: '#040D1A',
                fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                fontFamily: 'Orbitron, sans-serif', letterSpacing: '0.05em',
              }}>
                Subscribe
              </button>
            </form>
          )}
        </div>
      </motion.article>
    </div>
  )
}
