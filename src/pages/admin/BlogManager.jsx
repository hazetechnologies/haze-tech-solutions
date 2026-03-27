import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Plus, Edit2, Trash2, ArrowLeft, CheckCircle,
  AlertCircle, FileText, RefreshCw, X, Bold, Italic,
  List, ListOrdered, Quote, Link as LinkIcon,
} from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const EMPTY_POST = {
  title: '',
  slug: '',
  excerpt: '',
  cover_image_url: '',
  content: '',
  published: false,
}

// ─── Tiptap Toolbar ───────────────────────────────────────────────────────────

function ToolbarButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        background: active ? 'rgba(0,212,255,0.15)' : 'transparent',
        border: active ? '1px solid rgba(0,212,255,0.35)' : '1px solid transparent',
        borderRadius: '7px',
        color: active ? '#00D4FF' : '#64748B',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        flexShrink: 0,
        padding: 0,
      }}
      onMouseEnter={e => {
        if (!active && !disabled) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
          e.currentTarget.style.color = '#CBD5E1'
        }
      }}
      onMouseLeave={e => {
        if (!active && !disabled) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = '#64748B'
        }
      }}
    >
      {children}
    </button>
  )
}

function HeadingButton({ editor, level }) {
  if (!editor) return null
  const label = `H${level}`
  const active = editor.isActive('heading', { level })
  return (
    <ToolbarButton
      onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
      active={active}
      title={`Heading ${level}`}
    >
      <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{label}</span>
    </ToolbarButton>
  )
}

function Toolbar({ editor }) {
  const [linkDialog, setLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl]       = useState('')

  if (!editor) return null

  function applyLink() {
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
    }
    setLinkDialog(false)
    setLinkUrl('')
  }

  function openLinkDialog() {
    const prev = editor.getAttributes('link').href || ''
    setLinkUrl(prev)
    setLinkDialog(true)
  }

  return (
    <div style={styles.toolbar}>
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
        <Italic size={14} />
      </ToolbarButton>

      <div style={styles.toolbarDivider} />

      <HeadingButton editor={editor} level={1} />
      <HeadingButton editor={editor} level={2} />
      <HeadingButton editor={editor} level={3} />

      <div style={styles.toolbarDivider} />

      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
        <ListOrdered size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
        <Quote size={14} />
      </ToolbarButton>

      <div style={styles.toolbarDivider} />

      <ToolbarButton onClick={openLinkDialog} active={editor.isActive('link')} title="Add Link">
        <LinkIcon size={14} />
      </ToolbarButton>

      {/* Link dialog */}
      {linkDialog && (
        <div style={styles.linkDialog}>
          <input
            autoFocus
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink() } if (e.key === 'Escape') setLinkDialog(false) }}
            placeholder="https://example.com"
            style={styles.linkInput}
          />
          <button type="button" onClick={applyLink} style={styles.linkApplyBtn}>Apply</button>
          {editor.isActive('link') && (
            <button type="button" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkDialog(false) }} style={styles.linkRemoveBtn}>Remove</button>
          )}
          <button type="button" onClick={() => setLinkDialog(false)} style={styles.linkCancelBtn}><X size={13} /></button>
        </div>
      )}
    </div>
  )
}

// ─── PostEditor ───────────────────────────────────────────────────────────────

function PostEditor({ post, onBack, onSaved }) {
  const isEdit = Boolean(post?.id)
  const [form, setForm]     = useState(isEdit ? { ...post } : { ...EMPTY_POST })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [slugEdited, setSlugEdited] = useState(isEdit)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: 'Write your blog post content here…' }),
    ],
    content: form.content || '',
    onUpdate({ editor }) {
      setForm(prev => ({ ...prev, content: editor.getHTML() }))
    },
  })

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'title' && !slugEdited) {
        next.slug = slugify(value)
      }
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.title.trim()) { setError('Title is required.'); return }
    if (!form.slug.trim())  { setError('Slug is required.'); return }

    setSaving(true)
    try {
      const payload = {
        title:           form.title.trim(),
        slug:            form.slug.trim(),
        excerpt:         form.excerpt.trim(),
        cover_image_url: form.cover_image_url.trim(),
        content:         form.content || '',
        published:       Boolean(form.published),
      }

      let result
      if (isEdit) {
        result = await supabase.from('blog_posts').update(payload).eq('id', post.id).select().single()
      } else {
        result = await supabase.from('blog_posts').insert(payload).select().single()
      }

      if (result.error) throw result.error
      onSaved(result.data, isEdit)
    } catch (err) {
      console.error('Save error:', err)
      setError(err.message || 'Failed to save post.')
      setSaving(false)
    }
  }

  return (
    <div style={styles.editorWrap}>
      <style>{`
        .ProseMirror { outline: none; min-height: 300px; }
        .ProseMirror p { margin: 0 0 1em; color: #CBD5E1; font-size: 14px; line-height: 1.7; }
        .ProseMirror h1 { font-family: 'Orbitron', sans-serif; font-size: 22px; color: #F1F5F9; margin: 1.5em 0 0.5em; }
        .ProseMirror h2 { font-size: 18px; font-weight: 700; color: #F1F5F9; margin: 1.4em 0 0.4em; }
        .ProseMirror h3 { font-size: 15px; font-weight: 700; color: #E2E8F0; margin: 1.2em 0 0.4em; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 1.4em; margin: 0 0 1em; color: #CBD5E1; font-size: 14px; line-height: 1.7; }
        .ProseMirror li { margin-bottom: 0.3em; }
        .ProseMirror blockquote { border-left: 3px solid rgba(0,212,255,0.4); margin: 1em 0; padding: 8px 16px; background: rgba(0,212,255,0.05); color: #94A3B8; font-style: italic; border-radius: 0 8px 8px 0; }
        .ProseMirror a { color: #00D4FF; text-decoration: underline; }
        .ProseMirror a:hover { color: #38BDF8; }
        .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #334155; pointer-events: none; float: left; height: 0; font-style: italic; }
        .ProseMirror strong { color: #F1F5F9; }
      `}</style>

      {/* Back + Save header */}
      <div style={styles.editorHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={15} />
          Back to List
        </button>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={styles.publishToggleRow}>
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>Published</span>
            <button
              type="button"
              onClick={() => set('published', !form.published)}
              style={{
                ...styles.toggle,
                background: form.published ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.07)',
                border: form.published ? '1px solid rgba(0,212,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span style={{
                ...styles.toggleKnob,
                transform: form.published ? 'translateX(20px)' : 'translateX(2px)',
                background: form.published ? '#00D4FF' : '#334155',
              }} />
            </button>
          </label>
          <button onClick={handleSubmit} disabled={saving} style={styles.saveBtn}>
            {saving
              ? <><span style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block' }}>↻</span> Saving…</>
              : <><CheckCircle size={15} /> {isEdit ? 'Save Changes' : 'Publish Post'}</>
            }
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.editorForm}>
        {/* Title */}
        <input
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Post Title"
          style={styles.titleInput}
        />

        {/* Slug */}
        <div style={styles.metaRow}>
          <div style={styles.metaField}>
            <label style={styles.metaLabel}>Slug</label>
            <input
              value={form.slug}
              onChange={e => { setSlugEdited(true); set('slug', e.target.value) }}
              placeholder="post-url-slug"
              style={styles.metaInput}
            />
          </div>
          <div style={{ ...styles.metaField, flex: 2 }}>
            <label style={styles.metaLabel}>Cover Image URL</label>
            <input
              value={form.cover_image_url}
              onChange={e => set('cover_image_url', e.target.value)}
              placeholder="https://..."
              style={styles.metaInput}
            />
          </div>
        </div>

        {/* Excerpt */}
        <div style={styles.metaField}>
          <label style={styles.metaLabel}>Excerpt</label>
          <textarea
            value={form.excerpt}
            onChange={e => set('excerpt', e.target.value)}
            rows={2}
            placeholder="Short description shown in post listings…"
            style={styles.excerptTextarea}
          />
        </div>

        {/* Rich text editor */}
        <div style={styles.editorCard}>
          <Toolbar editor={editor} />
          <div style={styles.editorBody}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </form>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function BlogManager() {
  const [posts, setPosts]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView]         = useState('list')   // 'list' | 'editor'
  const [editPost, setEditPost] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchPosts = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('blog_posts')
        .select('id, title, slug, published, created_at, excerpt')
        .order('created_at', { ascending: false })
      if (err) throw err
      setPosts(data ?? [])
    } catch (err) {
      console.error('Fetch error:', err)
      setError(err.message || 'Failed to load posts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const handleRefresh = async () => {
    setRefreshing(true)
    setLoading(true)
    await fetchPosts()
    setRefreshing(false)
  }

  function openEditor(post = null) {
    if (post && post.id) {
      // fetch full content before editing
      supabase.from('blog_posts').select('*').eq('id', post.id).single()
        .then(({ data, error }) => {
          if (error) { alert('Failed to load post: ' + error.message); return }
          setEditPost(data)
          setView('editor')
        })
    } else {
      setEditPost(null)
      setView('editor')
    }
  }

  function handleSaved(savedPost, isEdit) {
    if (isEdit) {
      setPosts(prev => prev.map(p => p.id === savedPost.id ? { ...p, ...savedPost } : p))
    } else {
      setPosts(prev => [savedPost, ...prev])
    }
    setView('list')
    setEditPost(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { error: err } = await supabase.from('blog_posts').delete().eq('id', deleteTarget.id)
      if (err) throw err
      setPosts(prev => prev.filter(p => p.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      console.error('Delete error:', err)
      alert('Failed to delete: ' + (err.message || 'Unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  // ── Editor view ──
  if (view === 'editor') {
    return (
      <PostEditor
        post={editPost}
        onBack={() => { setView('list'); setEditPost(null) }}
        onSaved={handleSaved}
      />
    )
  }

  // ── List view ──
  return (
    <div style={styles.page}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin   { to{transform:rotate(360deg)} }
      `}</style>

      <div style={styles.topRow}>
        <div>
          <h2 style={styles.pageTitle}>Blog Manager</h2>
          <p style={styles.pageSub}>
            {!loading && <><span style={{ color: '#00D4FF', fontWeight: 600 }}>{posts.length}</span> <span style={{ color: '#475569' }}>{posts.length === 1 ? 'post' : 'posts'}</span></>}
            {loading && <span style={{ color: '#475569' }}>Loading…</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            style={styles.iconBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#00D4FF'; e.currentTarget.style.color = '#00D4FF' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#64748B' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }} />
            Refresh
          </button>
          <button
            onClick={() => openEditor(null)}
            style={styles.primaryBtn}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 20px rgba(0,212,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
          >
            <Plus size={16} />
            New Post
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <AlertCircle size={15} />
          <span>{error}</span>
          <button onClick={handleRefresh} style={styles.retryBtn}>Retry</button>
        </div>
      )}

      <div style={styles.tableCard}>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Title', 'Slug', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[200, 160, 60, 80, 80].map((w, j) => (
                      <td key={j} style={styles.td}>
                        <div style={{ height: '13px', width: w + 'px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !error && posts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '60px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '64px', height: '64px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={28} color="#334155" />
                      </div>
                      <p style={{ color: '#475569', fontWeight: 600, fontSize: '15px' }}>No blog posts yet</p>
                      <p style={{ color: '#334155', fontSize: '13px' }}>Click "New Post" to write your first article.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                posts.map((post, i) => (
                  <tr
                    key={post.id}
                    style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}
                  >
                    <td style={{ ...styles.td, fontWeight: 600, color: '#F1F5F9', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {post.title || 'Untitled'}
                    </td>
                    <td style={{ ...styles.td, color: '#475569', fontFamily: 'monospace', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {post.slug || '—'}
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 600,
                        ...(post.published
                          ? { background: 'rgba(34,197,94,0.15)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.3)' }
                          : { background: 'rgba(255,255,255,0.05)', color: '#475569', border: '1px solid rgba(255,255,255,0.08)' }
                        ),
                      }}>
                        {post.published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td style={{ ...styles.td, color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(post.created_at)}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => openEditor(post)}
                          title="Edit"
                          style={styles.actionBtn}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; e.currentTarget.style.color = '#A78BFA' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#475569' }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(post)}
                          title="Delete"
                          style={styles.actionBtn}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = '#F87171' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#475569' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div style={styles.confirmModal}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '12px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>Delete Post</h3>
              <button onClick={() => setDeleteTarget(null)} style={styles.closeBtn}><X size={16} /></button>
            </div>
            <p style={{ color: '#94A3B8', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
              Delete <strong style={{ color: '#F1F5F9' }}>"{deleteTarget.title}"</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setDeleteTarget(null)} style={styles.cancelBtn}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} style={styles.deleteBtn}>
                {deleting ? 'Deleting…' : <><Trash2 size={13} /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  topRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  pageTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '14px',
    fontWeight: 700,
    color: '#F1F5F9',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  pageSub: { fontSize: '13px', color: '#475569' },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '9px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#64748B',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '9px 18px',
    background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(139,92,246,0.15))',
    border: '1px solid rgba(0,212,255,0.35)',
    borderRadius: '9px',
    color: '#00D4FF',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    transition: 'box-shadow 0.2s',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '10px',
    padding: '12px 16px',
    color: '#FCA5A5',
    fontSize: '13px',
  },
  retryBtn: {
    marginLeft: 'auto',
    padding: '4px 12px',
    background: 'rgba(239,68,68,0.2)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '6px',
    color: '#FCA5A5',
    fontSize: '12px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
  },
  tableCard: {
    background: '#0F172A',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    padding: '12px 20px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 600,
    color: '#475569',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    whiteSpace: 'nowrap',
    background: 'rgba(255,255,255,0.02)',
  },
  td: {
    padding: '14px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle',
    color: '#CBD5E1',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    color: '#475569',
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(2,8,23,0.8)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '20px',
  },
  confirmModal: {
    background: '#0F172A',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '16px',
    padding: '24px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '30px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '7px',
    color: '#64748B',
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '9px 18px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#64748B',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
  },
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '9px 18px',
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: '9px',
    color: '#F87171',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
  },
  // editor view
  editorWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  editorHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '9px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#64748B',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
  },
  publishToggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
  },
  toggle: {
    position: 'relative',
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'background 0.2s, border-color 0.2s',
    flexShrink: 0,
  },
  toggleKnob: {
    position: 'absolute',
    top: '3px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    transition: 'transform 0.2s, background 0.2s',
  },
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 22px',
    background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(139,92,246,0.2))',
    border: '1px solid rgba(0,212,255,0.4)',
    borderRadius: '9px',
    color: '#00D4FF',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    transition: 'box-shadow 0.2s',
  },
  editorForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  titleInput: {
    width: '100%',
    padding: '16px 20px',
    background: '#0F172A',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    color: '#F1F5F9',
    fontSize: '24px',
    fontWeight: 700,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  metaRow: {
    display: 'flex',
    gap: '14px',
    flexWrap: 'wrap',
  },
  metaField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
    minWidth: '160px',
  },
  metaLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#475569',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  metaInput: {
    padding: '9px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '9px',
    color: '#F1F5F9',
    fontSize: '13px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  excerptTextarea: {
    padding: '9px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '9px',
    color: '#F1F5F9',
    fontSize: '13px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    resize: 'vertical',
    lineHeight: 1.6,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  editorCard: {
    background: '#0F172A',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(255,255,255,0.02)',
    flexWrap: 'wrap',
    position: 'relative',
  },
  toolbarDivider: {
    width: '1px',
    height: '20px',
    background: 'rgba(255,255,255,0.08)',
    margin: '0 4px',
    flexShrink: 0,
  },
  editorBody: {
    padding: '20px 24px',
    minHeight: '320px',
  },
  linkDialog: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: '14px',
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: '#1E293B',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '10px',
    padding: '8px 10px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  linkInput: {
    padding: '6px 10px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '7px',
    color: '#F1F5F9',
    fontSize: '12px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    width: '220px',
    outline: 'none',
  },
  linkApplyBtn: {
    padding: '6px 12px',
    background: 'rgba(0,212,255,0.15)',
    border: '1px solid rgba(0,212,255,0.3)',
    borderRadius: '7px',
    color: '#00D4FF',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  linkRemoveBtn: {
    padding: '6px 10px',
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '7px',
    color: '#F87171',
    fontSize: '12px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  linkCancelBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '7px',
    color: '#64748B',
    cursor: 'pointer',
  },
}
