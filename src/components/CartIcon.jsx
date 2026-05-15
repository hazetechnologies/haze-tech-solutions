import { Link } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '../lib/cart'

// Small cart-status pill used by Navbar + PortalLayout.
// `variant` controls color treatment so the same icon fits dark Navbar + dark portal sidebar.
export default function CartIcon({ variant = 'public' }) {
  const { count } = useCart()
  const isPortal = variant === 'portal'

  return (
    <Link
      to="/cart"
      aria-label={`Shopping cart, ${count} item${count === 1 ? '' : 's'}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 9,
        background: isPortal ? 'transparent' : 'rgba(0,207,255,0.06)',
        border: '1px solid rgba(0,207,255,0.25)',
        borderRadius: 9,
        color: '#00CFFF',
        textDecoration: 'none',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#00CFFF' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,207,255,0.25)' }}
    >
      <ShoppingCart size={16} />
      {count > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6,
          minWidth: 18, height: 18, padding: '0 5px',
          background: '#FF6B00', color: '#020617',
          borderRadius: 999,
          fontSize: 10, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        }}>{count}</span>
      )}
    </Link>
  )
}
