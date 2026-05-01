// src/components/SentryFallback.jsx
export default function SentryFallback({ resetError }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: '#020817',
      color: '#F1F5F9',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>
        Something broke on our end
      </h1>
      <p style={{ color: '#94A3B8', marginBottom: '2rem', maxWidth: 480 }}>
        Our team has been notified. You can reload, head back home, or email us if it persists.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={resetError}
          style={{
            background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
            color: '#020817',
            border: 'none',
            padding: '0.7rem 1.4rem',
            borderRadius: 8,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            background: 'transparent',
            color: '#00CFFF',
            border: '1px solid rgba(0, 207, 255, 0.4)',
            padding: '0.7rem 1.4rem',
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Back to home
        </a>
      </div>
    </div>
  )
}
