import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Calendar, ArrowRight } from 'lucide-react'

export default function BlogPage() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, cover_image_url, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPosts(data ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div style={{ background: '#040D1A', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#E8F4FF' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap');`}</style>

      {/* Navbar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(4,13,26,0.9)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(0,207,255,0.1)',
        padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94A3B8', textDecoration: 'none', fontSize: '0.9rem' }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <span style={{ fontFamily: 'Orbitron, sans-serif', color: '#00CFFF', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '1px' }}>
          BLOG
        </span>
      </nav>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '4rem 1.5rem 2rem' }}>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 900, margin: '0 0 1rem' }}
        >
          Insights & <span style={{ background: 'linear-gradient(135deg, #00CFFF, #FF6B00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Updates</span>
        </motion.h1>
        <p style={{ color: '#8BA8C4', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
          AI automation tips, marketing strategies, and business growth insights from the Haze Tech team.
        </p>
      </div>

      {/* Posts grid */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 300, background: 'rgba(255,255,255,0.03)', borderRadius: 16, border: '1px solid rgba(0,207,255,0.08)' }} />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <p style={{ color: '#8BA8C4', fontSize: '1rem' }}>No posts yet. Check back soon!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {posts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Link to={`/blog/${post.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{
                    background: 'rgba(0,207,255,0.03)',
                    border: '1px solid rgba(0,207,255,0.1)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    transition: 'border-color 0.2s, transform 0.2s',
                    cursor: 'pointer',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,207,255,0.3)'; e.currentTarget.style.transform = 'translateY(-4px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,207,255,0.1)'; e.currentTarget.style.transform = 'translateY(0)' }}
                  >
                    {post.cover_image_url && (
                      <div style={{ height: 180, overflow: 'hidden' }}>
                        <img src={post.cover_image_url} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ padding: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.75rem', color: '#8BA8C4' }}>
                        <Calendar size={12} />
                        {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem', lineHeight: 1.3 }}>{post.title}</h2>
                      {post.excerpt && <p style={{ fontSize: '0.85rem', color: '#8BA8C4', margin: '0 0 1rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.excerpt}</p>}
                      <span style={{ fontSize: '0.8rem', color: '#00CFFF', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                        Read more <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
