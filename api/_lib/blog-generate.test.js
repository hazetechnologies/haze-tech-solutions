import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildBlogPrompt, parseBlogGeneration } from './blog-generate.js'

Deno.test('buildBlogPrompt includes topic, tone, keywords, category, and word target', () => {
  const { system, user } = buildBlogPrompt({ topic: 'Why SEO matters', keywords: 'ranking, traffic', tone: 'Educational', length: 'short', category: 'SEO' })
  assertEquals(typeof system, 'string')
  assertEquals(user.includes('Why SEO matters'), true)
  assertEquals(user.includes('ranking, traffic'), true)
  assertEquals(user.includes('Educational'), true)
  assertEquals(user.includes('SEO'), true)
  assertEquals(user.includes('500'), true) // short ≈ 500 words
})

Deno.test('parseBlogGeneration reads clean JSON', () => {
  const out = parseBlogGeneration('{"title":"T","excerpt":"E","content":"<p>C</p>"}')
  assertEquals(out, { title: 'T', excerpt: 'E', content: '<p>C</p>' })
})

Deno.test('parseBlogGeneration tolerates code fences and surrounding prose', () => {
  const raw = 'Here you go:\n```json\n{"title":"T","excerpt":"E","content":"<p>C</p>"}\n```\nHope that helps!'
  assertEquals(parseBlogGeneration(raw).title, 'T')
})

Deno.test('parseBlogGeneration throws on missing title/content', () => {
  assertThrows(() => parseBlogGeneration('{"excerpt":"only"}'), Error)
})

Deno.test('parseBlogGeneration throws on non-JSON garbage', () => {
  assertThrows(() => parseBlogGeneration('no json here'), Error)
})
