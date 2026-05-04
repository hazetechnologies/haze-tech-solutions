// supabase/functions/generate-brand-kit/types.ts

export type IntakePath = 'audit_prefill' | 'cold_start'

export interface BrandKitInputs {
  path: IntakePath
  business_name: string
  business_description?: string
  industry: string
  audience: string
  vibe: string[]
  color_preference: string
  inspirations: string
  voice_tone_preference?: string
  goal?: string        // Path 1 only
  challenge?: string   // Path 1 only
}

export interface ColorPaletteEntry {
  name: 'primary' | 'secondary' | 'accent' | 'dark' | 'light'
  hex: string
  use: string
}

export interface ContentPillar {
  name: string
  description: string
}


export interface ImageAssetRef {
  r2_key: string
  public_url: string
}

export type ImageAssetId =
  | 'logo_primary'
  | 'logo_icon'
  | 'logo_monochrome'
  | 'profile_picture'
  | 'banner_ig'
  | 'banner_fb'
  | 'banner_yt'
  | 'banner_x'
  | 'banner_tiktok'
  | 'banner_linkedin_cover'

export interface BrandKitAssets {
  bios: { instagram: string; tiktok: string; youtube: string; x: string; facebook: string; linkedin: string }
  voice_tone: string                       // markdown
  hashtags: string[]
  content_pillars: ContentPillar[]
  handles?: string[]                        // Path 3 only
  platform_priority?: string                // Path 3 only
  color_palette: ColorPaletteEntry[]
  images: Record<ImageAssetId, ImageAssetRef>
}
