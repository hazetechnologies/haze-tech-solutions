// supabase/functions/generate-social-audit/lib/types.ts
export type Platform = 'instagram' | 'youtube'

export interface PlatformInput {
  self: string
  competitors: string[]  // 0-2 entries
}

export interface AuditInputs {
  platforms: Partial<Record<Platform, PlatformInput>>
  audience: string
  goal: 'Engagement' | 'Leads' | 'Awareness' | 'Sales'
  challenge: string
}

export interface FetchedPost {
  id: string
  caption: string
  like_count: number
  comments_count: number
  media_type: string
  timestamp: string         // ISO 8601
  permalink: string
  thumbnail_url?: string
  media_url?: string
}

export interface FetchedHandle {
  handle: string
  available: boolean
  unavailable_reason?: 'personal_account' | 'not_found' | 'api_error'
  followers_count?: number
  media_count?: number
  posts: FetchedPost[]
}

export interface FetchedPlatform {
  self?: FetchedHandle
  competitors: FetchedHandle[]
  error?: string
}

export interface RawData {
  instagram?: FetchedPlatform
  youtube?: FetchedPlatform
  warnings: string[]
}

export interface PlatformReport {
  current_state: {
    followers: number
    weekly_posts: number
    engagement_rate: number
  }
  competitor_comparison: Array<{
    handle: string
    followers: number
    weekly_posts: number
    engagement_rate: number
  }>
  content_analysis: {
    strengths: string[]
    weaknesses: string[]
    visual_consistency_score: number  // 1-10
  }
  recommendations: string[]
}

export interface AuditReport {
  headline: string
  summary: string
  platforms: Partial<Record<Platform, PlatformReport>>
  top_recommendations: string[]
  next_steps_cta: string
}
