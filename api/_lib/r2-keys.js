// api/_lib/r2-keys.js
// Pure key/URL builders for R2 blog assets — NO process.env, NO aws-sdk imports,
// so they're unit-testable under Deno without --allow-env. The impure upload
// client lives in r2.js (which re-exports these).

export function slugifyForKey(str) {
  const s = (str || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return s || 'post'
}

export function buildBlogImageKey(title, ts) {
  return `blog/${ts}-${slugifyForKey(title)}.png`
}

export function publicUrlFor(key, base) {
  return `${(base || '').replace(/\/$/, '')}/${key}`
}
