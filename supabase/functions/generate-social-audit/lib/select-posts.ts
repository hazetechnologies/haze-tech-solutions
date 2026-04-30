// supabase/functions/generate-social-audit/lib/select-posts.ts
import type { FetchedPost } from './types.ts'

const TOP_BY_ENGAGEMENT = 5
const TOP_BY_RECENCY = 5

export function selectPosts(posts: FetchedPost[]): FetchedPost[] {
  if (posts.length <= TOP_BY_ENGAGEMENT + TOP_BY_RECENCY) {
    return [...posts]
  }

  const engagementSorted = [...posts].sort((a, b) =>
    (b.like_count + b.comments_count) - (a.like_count + a.comments_count)
  )
  const recencySorted = [...posts].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const selected = new Map<string, FetchedPost>()
  for (const p of engagementSorted.slice(0, TOP_BY_ENGAGEMENT)) selected.set(p.id, p)
  for (const p of recencySorted.slice(0, TOP_BY_RECENCY))      selected.set(p.id, p)
  return Array.from(selected.values())
}
