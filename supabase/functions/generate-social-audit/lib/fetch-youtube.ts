// supabase/functions/generate-social-audit/lib/fetch-youtube.ts
import type { FetchedHandle, FetchedPlatform, FetchedPost } from './types.ts'

function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`${name} must be set`)
  return v
}

const YT_KEY = requireEnv('YOUTUBE_API_KEY')

function parseHandle(input: string): { handle?: string; channelId?: string } {
  const trimmed = input.trim()
  if (/^UC[\w-]{22}$/.test(trimmed)) return { channelId: trimmed }
  const urlMatch = trimmed.match(/youtube\.com\/(@[\w.-]+|channel\/(UC[\w-]{22}))/i)
  if (urlMatch) {
    if (urlMatch[2]) return { channelId: urlMatch[2] }
    return { handle: urlMatch[1] }
  }
  if (trimmed.startsWith('@')) return { handle: trimmed }
  return { handle: '@' + trimmed }
}

type ResolveResult =
  | { kind: 'ok'; channel: { id: string; snippet: any; statistics: any } }
  | { kind: 'not_found' }
  | { kind: 'api_error' }

async function resolveChannel(input: string): Promise<ResolveResult> {
  const parsed = parseHandle(input)
  const param = parsed.channelId
    ? `id=${encodeURIComponent(parsed.channelId)}`
    : `forHandle=${encodeURIComponent(parsed.handle!)}`
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&${param}&key=${encodeURIComponent(YT_KEY)}`
  const res = await fetch(url)
  if (res.status === 403 || res.status >= 500) return { kind: 'api_error' }
  if (!res.ok) return { kind: 'not_found' }
  const data = await res.json()
  if (!data.items?.length) return { kind: 'not_found' }
  return { kind: 'ok', channel: data.items[0] }
}

async function fetchRecentVideos(channelId: string): Promise<FetchedPost[]> {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?channelId=${encodeURIComponent(channelId)}&part=snippet&order=date&maxResults=20&type=video&key=${encodeURIComponent(YT_KEY)}`
  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) return []
  const searchData = await searchRes.json()
  const videoIds: string[] = (searchData.items ?? []).map((x: any) => x.id?.videoId).filter(Boolean)
  if (videoIds.length === 0) return []

  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoIds.map(encodeURIComponent).join(',')}&part=snippet,statistics&key=${encodeURIComponent(YT_KEY)}`
  const videosRes = await fetch(videosUrl)
  if (!videosRes.ok) return []
  const videosData = await videosRes.json()

  return (videosData.items ?? []).map((v: any) => ({
    id: v.id,
    caption: `${v.snippet.title}\n\n${v.snippet.description ?? ''}`,
    like_count: parseInt(v.statistics?.likeCount ?? '0', 10),
    comments_count: parseInt(v.statistics?.commentCount ?? '0', 10),
    media_type: 'VIDEO',
    timestamp: v.snippet.publishedAt,
    permalink: `https://www.youtube.com/watch?v=${v.id}`,
    thumbnail_url: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.default?.url,
  }))
}

function deriveDisplayHandle(channel: { id: string; snippet: any }): string {
  if (channel.snippet?.customUrl) return '@' + channel.snippet.customUrl
  return channel.id  // fallback to UC... ID; no @ prefix because title contains spaces/emoji
}

async function fetchOne(input: string): Promise<FetchedHandle> {
  try {
    const result = await resolveChannel(input)
    if (result.kind === 'api_error') {
      return { handle: input, available: false, unavailable_reason: 'api_error', posts: [] }
    }
    if (result.kind === 'not_found') {
      return { handle: input, available: false, unavailable_reason: 'not_found', posts: [] }
    }
    const { channel } = result
    const posts = await fetchRecentVideos(channel.id)
    return {
      handle: deriveDisplayHandle(channel),
      available: true,
      followers_count: parseInt(channel.statistics?.subscriberCount ?? '0', 10),
      media_count: parseInt(channel.statistics?.videoCount ?? '0', 10),
      posts,
    }
  } catch (_err) {
    return { handle: input, available: false, unavailable_reason: 'api_error', posts: [] }
  }
}

export async function fetchYouTube(self: string, competitors: string[]): Promise<FetchedPlatform> {
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
