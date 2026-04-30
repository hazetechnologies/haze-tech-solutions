// supabase/functions/generate-social-audit/lib/fetch-instagram.ts
import type { FetchedHandle, FetchedPlatform, FetchedPost } from './types.ts'

function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`${name} must be set`)
  return v
}

const GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') ?? 'v21.0'
const IG_BIZ_ID = requireEnv('META_IG_BUSINESS_ACCOUNT_ID')
const PAGE_TOKEN = requireEnv('META_PAGE_ACCESS_TOKEN')

const FIELDS = `business_discovery.username({u}){followers_count,media_count,media.limit(20){id,caption,like_count,comments_count,media_type,timestamp,permalink,thumbnail_url,media_url}}`

function normalize(h: string): string {
  return h
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .replace(/^@/, '')
    .trim()
    .toLowerCase()
}

function classifyError(code: number, message: string): FetchedHandle['unavailable_reason'] {
  if (code !== 100) return 'api_error'
  const m = message.toLowerCase()
  if (m.includes('does not exist')) return 'not_found'
  if (m.includes('not a business') || m.includes('not a creator') || m.includes('business account')) {
    return 'personal_account'
  }
  return 'api_error'
}

async function fetchOne(handle: string): Promise<FetchedHandle> {
  const username = normalize(handle)
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${IG_BIZ_ID}?fields=${encodeURIComponent(FIELDS.replace('{u}', username))}&access_token=${encodeURIComponent(PAGE_TOKEN)}`

  const res = await fetch(url)
  if (res.status >= 500) {
    return { handle: '@' + username, available: false, unavailable_reason: 'api_error', posts: [] }
  }

  const data = await res.json()

  if (data.error) {
    const reason = classifyError(data.error.code, String(data.error.message || ''))
    return { handle: '@' + username, available: false, unavailable_reason: reason, posts: [] }
  }

  const bd = data.business_discovery
  if (!bd) {
    return { handle: '@' + username, available: false, unavailable_reason: 'not_found', posts: [] }
  }

  const posts: FetchedPost[] = (bd.media?.data ?? []).map((m: any) => ({
    id: m.id,
    caption: m.caption ?? '',
    like_count: m.like_count ?? 0,
    comments_count: m.comments_count ?? 0,
    media_type: m.media_type ?? 'IMAGE',
    timestamp: m.timestamp,
    permalink: m.permalink,
    thumbnail_url: m.thumbnail_url,
    media_url: m.media_url,
  }))

  return {
    handle: '@' + username,
    available: true,
    followers_count: bd.followers_count,
    media_count: bd.media_count,
    posts,
  }
}

export async function fetchInstagram(self: string, competitors: string[]): Promise<FetchedPlatform> {
  try {
    const [selfRes, ...compRes] = await Promise.all([
      fetchOne(self),
      ...competitors.map(c => fetchOne(c)),
    ])
    return { self: selfRes, competitors: compRes }
  } catch (err) {
    return { self: undefined, competitors: [], error: err instanceof Error ? err.message : String(err) }
  }
}
