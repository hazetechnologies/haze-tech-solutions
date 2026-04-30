// supabase/functions/generate-social-audit/lib/select-posts.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { selectPosts } from './select-posts.ts'
import type { FetchedPost } from './types.ts'

const post = (id: string, likes: number, comments: number, ts: string): FetchedPost => ({
  id, like_count: likes, comments_count: comments, timestamp: ts,
  caption: '', media_type: 'IMAGE', permalink: ''
})

Deno.test('returns at most 10 posts deduped', () => {
  const posts: FetchedPost[] = Array.from({ length: 20 }, (_, i) =>
    post(`p${i}`, i * 10, i, `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
  )
  const result = selectPosts(posts)
  assertEquals(result.length, 10)
  assertEquals(new Set(result.map(p => p.id)).size, 10)
})

Deno.test('top-engagement and most-recent overlap is deduped', () => {
  // p0 is both top-engagement (likes=100, comments=50) and most-recent
  const posts: FetchedPost[] = [
    post('p0', 100, 50, '2026-04-30T00:00:00Z'),
    post('p1', 50,  10, '2026-04-29T00:00:00Z'),
    post('p2', 30,   5, '2026-04-28T00:00:00Z'),
    post('p3', 10,   1, '2026-04-27T00:00:00Z'),
  ]
  const result = selectPosts(posts)
  assertEquals(result.length, 4)  // not 5+5=10 because of dedup
})

Deno.test('returns all posts if fewer than 10', () => {
  const posts: FetchedPost[] = [
    post('p0', 1, 1, '2026-04-30T00:00:00Z'),
    post('p1', 2, 2, '2026-04-29T00:00:00Z'),
  ]
  const result = selectPosts(posts)
  assertEquals(result.length, 2)
})

Deno.test('engagement is likes + comments', () => {
  const posts: FetchedPost[] = [
    post('high-likes',    100, 0,   '2026-01-01T00:00:00Z'),  // engagement 100
    post('high-comments', 0,   200, '2026-01-02T00:00:00Z'),  // engagement 200
    post('balanced',      50,  50,  '2026-01-03T00:00:00Z'),  // engagement 100
  ]
  const result = selectPosts(posts)
  // top-3 by engagement = high-comments, high-likes/balanced (tied)
  // top-3 by recency = balanced, high-comments, high-likes
  // so first by engagement is high-comments
  assertEquals(result[0].id, 'high-comments')
})
