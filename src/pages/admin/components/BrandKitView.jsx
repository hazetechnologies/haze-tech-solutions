// src/pages/admin/components/BrandKitView.jsx
import { useState } from 'react'
import { Copy, Check, Download, RefreshCw } from 'lucide-react'

const IMAGE_LABELS = {
  logo_primary: { label: 'Logo (primary)', dims: '1024×1024' },
  logo_icon: { label: 'Logo (icon)', dims: '1024×1024' },
  logo_monochrome: { label: 'Logo (monochrome)', dims: '1024×1024' },
  profile_picture: { label: 'Profile picture', dims: '1024×1024' },
  banner_ig: { label: 'Instagram story', dims: '1080×1920' },
  banner_fb: { label: 'Facebook cover', dims: '820×312' },
  banner_yt: { label: 'YouTube banner', dims: '2560×1440' },
  banner_x: { label: 'X header', dims: '1500×500' },
  banner_tiktok: { label: 'TikTok profile', dims: '200×200' },
}

const BIO_LIMITS = {
  instagram: 150, tiktok: 80, youtube: 1000, x: 160, facebook: 255,
}

export default function BrandKitView({ kit, onRegenerate }) {
  const a = kit.assets || {}
  const generatedAt = new Date(kit.updated_at).toLocaleString()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#64748B', fontSize: 12 }}>Generated {generatedAt}</div>
        <button onClick={onRegenerate} style={btnSecondary}>
          <RefreshCw size={13} /> Regenerate Kit
        </button>
      </div>

      {/* Visual identity */}
      <Section title="Visual identity">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {Object.entries(a.images || {}).map(([assetId, img]) => {
            const label = IMAGE_LABELS[assetId]?.label ?? assetId
            const dims = IMAGE_LABELS[assetId]?.dims ?? ''
            return (
              <div key={assetId} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 12 }}>
                <div style={{ width: '100%', aspectRatio: '1', background: '#0F172A', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8 }}>
                  <img src={img.public_url} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ color: '#F1F5F9', fontSize: 12, fontWeight: 600 }}>{label}</div>
                    <div style={{ color: '#64748B', fontSize: 11 }}>{dims}</div>
                  </div>
                  <a href={img.public_url} download style={{ ...btnSecondary, padding: '4px 8px' }}>
                    <Download size={12} />
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Color palette */}
      <Section title="Color palette">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {(a.color_palette || []).map(c => (
            <div key={c.name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 12 }}>
              <div style={{ width: '100%', height: 60, background: c.hex, borderRadius: 6, marginBottom: 8 }} />
              <div style={{ color: '#F1F5F9', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{c.name}</div>
              <CopyableText text={c.hex} small />
              <div style={{ color: '#64748B', fontSize: 11, marginTop: 4 }}>{c.use}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Profile bios */}
      <Section title="Profile bios">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {Object.entries(a.bios || {}).map(([platform, text]) => (
            <div key={platform} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ color: '#F1F5F9', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{platform}</div>
                <div style={{ color: '#64748B', fontSize: 11 }}>{text.length} / {BIO_LIMITS[platform]}</div>
              </div>
              <div style={{ color: '#CBD5E1', fontSize: 12, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{text}</div>
              <CopyableText text={text} />
            </div>
          ))}
        </div>
      </Section>

      {/* Voice & tone */}
      <Section title="Voice & tone">
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 16, color: '#CBD5E1', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {a.voice_tone}
        </div>
        <CopyableText text={a.voice_tone} />
      </Section>

      {/* Hashtags */}
      <Section title="Hashtags">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(a.hashtags || []).map(h => (
            <span key={h} style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00CFFF', borderRadius: 100, padding: '4px 12px', fontSize: 12 }}>{h}</span>
          ))}
        </div>
        <CopyableText text={(a.hashtags || []).join(' ')} />
      </Section>

      {/* Content pillars */}
      <Section title="Content pillars">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {(a.content_pillars || []).map((p, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 12 }}>
              <div style={{ color: '#F1F5F9', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
              <div style={{ color: '#94A3B8', fontSize: 12 }}>{p.description}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Path 3 only: handle suggestions + platform priority */}
      {a.handles && (
        <Section title="Handle suggestions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {a.handles.map(h => (
              <div key={h} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px' }}>
                <code style={{ color: '#F1F5F9', fontSize: 13, fontFamily: 'monospace' }}>{h}</code>
                <CopyableText text={h} small />
              </div>
            ))}
          </div>
        </Section>
      )}

      {a.platform_priority && (
        <Section title="Platform launch priority">
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 16, color: '#CBD5E1', fontSize: 13 }}>
            {a.platform_priority}
          </div>
        </Section>
      )}

    </div>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h3 style={{ color: '#F1F5F9', fontSize: 14, fontWeight: 700, margin: '0 0 10px', letterSpacing: '0.02em' }}>{title}</h3>
      {children}
    </section>
  )
}

function CopyableText({ text, small }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} style={{
      background: 'transparent', border: '1px solid rgba(0,212,255,0.25)', color: '#00CFFF',
      borderRadius: 6, padding: small ? '2px 6px' : '4px 10px', fontSize: small ? 11 : 12,
      display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginTop: small ? 0 : 6,
    }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

const btnSecondary = {
  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
  color: '#94A3B8', borderRadius: 6, padding: '6px 10px', fontSize: 12,
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  textDecoration: 'none',
}
