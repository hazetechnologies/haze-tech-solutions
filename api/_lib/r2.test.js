import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { slugifyForKey, buildBlogImageKey, publicUrlFor } from './r2-keys.js'

Deno.test('slugifyForKey lowercases, strips punctuation, hyphenates', () => {
  assertEquals(slugifyForKey('Why SEO Matters in 2026!'), 'why-seo-matters-in-2026')
})

Deno.test('slugifyForKey falls back to "post" when empty', () => {
  assertEquals(slugifyForKey('—'), 'post')
  assertEquals(slugifyForKey(''), 'post')
})

Deno.test('buildBlogImageKey composes blog/<ts>-<slug>.png', () => {
  assertEquals(buildBlogImageKey('My Post', '2026-06-29T12-00-00'), 'blog/2026-06-29T12-00-00-my-post.png')
})

Deno.test('publicUrlFor joins base + key, trimming trailing slash', () => {
  assertEquals(publicUrlFor('blog/x.png', 'https://pub-abc.r2.dev/'), 'https://pub-abc.r2.dev/blog/x.png')
  assertEquals(publicUrlFor('blog/x.png', 'https://pub-abc.r2.dev'), 'https://pub-abc.r2.dev/blog/x.png')
})
