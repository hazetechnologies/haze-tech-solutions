// Tiny localStorage-backed cart shared by the public site and the portal.
// Plans are one-of-a-kind in our catalog so cart items don't carry a quantity.
// Item shape: { plan_id, product_id, added_at }
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'haze-cart-v1'
const CHANGE_EVENT = 'haze-cart-changed'

function readCart() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeCart(items) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  // Same-tab listeners (the storage event only fires cross-tab).
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useCart() {
  const [items, setItems] = useState(readCart)

  useEffect(() => {
    const reread = () => setItems(readCart())
    window.addEventListener(CHANGE_EVENT, reread)
    window.addEventListener('storage', reread)  // cross-tab
    return () => {
      window.removeEventListener(CHANGE_EVENT, reread)
      window.removeEventListener('storage', reread)
    }
  }, [])

  const add = useCallback((planId, productId) => {
    const current = readCart()
    if (current.find(i => i.plan_id === planId)) return false
    writeCart([...current, { plan_id: planId, product_id: productId, added_at: Date.now() }])
    return true
  }, [])

  const remove = useCallback((planId) => {
    writeCart(readCart().filter(i => i.plan_id !== planId))
  }, [])

  const clear = useCallback(() => {
    writeCart([])
  }, [])

  const has = useCallback((planId) => items.some(i => i.plan_id === planId), [items])

  return { items, add, remove, clear, has, count: items.length }
}
