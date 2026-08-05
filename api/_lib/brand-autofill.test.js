import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { isSafePublicUrl, htmlToText, parseBrandAutofill, EMPTY_AUTOFILL } from './brand-autofill.js'

Deno.test('isSafePublicUrl allows public http(s)', () => {
  assertEquals(isSafePublicUrl('https://example.com'), true)
  assertEquals(isSafePublicUrl('http://acme.co/page'), true)
})
Deno.test('isSafePublicUrl rejects non-http(s) and internal hosts', () => {
  assertEquals(isSafePublicUrl('ftp://example.com'), false)
  assertEquals(isSafePublicUrl('file:///etc/passwd'), false)
  assertEquals(isSafePublicUrl('http://localhost'), false)
  assertEquals(isSafePublicUrl('http://127.0.0.1'), false)
  assertEquals(isSafePublicUrl('http://169.254.169.254/latest/meta-data'), false)
  assertEquals(isSafePublicUrl('http://10.0.0.5'), false)
  assertEquals(isSafePublicUrl('http://192.168.1.1'), false)
  assertEquals(isSafePublicUrl('http://172.16.0.2'), false)
  assertEquals(isSafePublicUrl('http://box.internal'), false)
  assertEquals(isSafePublicUrl('http://printer.local'), false)
  assertEquals(isSafePublicUrl(''), false)
  assertEquals(isSafePublicUrl('not a url'), false)
})
Deno.test('htmlToText strips scripts/styles/tags, keeps title text, collapses ws', () => {
  const html = '<html><head><title>Acme Co</title><style>.x{color:red}</style></head><body><script>alert(1)</script><h1>Hello</h1>\n\n  <p>We do   things.</p></body></html>'
  const t = htmlToText(html)
  assertEquals(t.includes('Acme Co'), true)
  assertEquals(t.includes('Hello'), true)
  assertEquals(t.includes('We do things.'), true)
  assertEquals(t.includes('alert(1)'), false)
  assertEquals(t.includes('color:red'), false)
})
Deno.test('htmlToText caps at 15000 chars', () => {
  const big = '<p>' + 'a'.repeat(40000) + '</p>'
  assertEquals(htmlToText(big).length <= 15000, true)
})
Deno.test('parseBrandAutofill reads clean JSON + validates hex', () => {
  const raw = JSON.stringify({ business_description:'d', industry:'i', audience:'a', color_preference:'c', brand_colors:{primary:'#112233', secondary:'nothex', accent:'#AABBCC'}, imagery_direction:'im', tagline_override:'t', cta_override:'x' })
  const o = parseBrandAutofill(raw)
  assertEquals(o.business_description, 'd')
  assertEquals(o.brand_colors.primary, '#112233')
  assertEquals(o.brand_colors.secondary, '') // invalid hex dropped
  assertEquals(o.brand_colors.accent, '#AABBCC')
})
Deno.test('parseBrandAutofill tolerates fences/prose, garbage → all-empty, never throws', () => {
  assertEquals(parseBrandAutofill('```json\n{"industry":"Tech"}\n```').industry, 'Tech')
  assertEquals(parseBrandAutofill('no json here'), EMPTY_AUTOFILL)
  assertEquals(parseBrandAutofill(''), EMPTY_AUTOFILL)
})
Deno.test('isSafePublicUrl rejects trailing-dot internal hosts', () => {
  assertEquals(isSafePublicUrl('http://localhost.'), false)
  assertEquals(isSafePublicUrl('http://box.internal.'), false)
  assertEquals(isSafePublicUrl('http://printer.local.'), false)
})
Deno.test('isSafePublicUrl IPv6: reject internal, allow public', () => {
  assertEquals(isSafePublicUrl('http://[::1]'), false)
  assertEquals(isSafePublicUrl('http://[::ffff:127.0.0.1]'), false)
  assertEquals(isSafePublicUrl('http://[fc00::1]'), false)
  assertEquals(isSafePublicUrl('http://[fe80::1]'), false)
  assertEquals(isSafePublicUrl('http://[2001:4860:4860::8888]'), true)
})
Deno.test('htmlToText decodes numeric + hex entities', () => {
  const t = htmlToText('<p>It&#8217;s a caf&#233; &#x2014; nice.</p>')
  assertEquals(t.includes('It’s'), true)
  assertEquals(t.includes('café'), true)
  assertEquals(t.includes('—'), true)
})
Deno.test('htmlToText reads meta description in reversed attr order', () => {
  const t = htmlToText('<html><head><meta content="Great desc here" property="og:description"></head><body>x</body></html>')
  assertEquals(t.includes('Great desc here'), true)
})
