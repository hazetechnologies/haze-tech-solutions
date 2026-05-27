// supabase/functions/generate-brand-kit/types.ts

export type IntakePath = 'audit_prefill' | 'cold_start'

export interface BrandKitInputs {
  path: IntakePath
  business_name: string
  business_description?: string
  industry: string
  audience: string
  vibe: string[]
  color_preference?: string
  inspirations: string
  voice_tone_preference?: string
  goal?: string        // Path 1 only
  challenge?: string   // Path 1 only

  // Optional explicit assets — when set, the generator uses these instead of
  // the LLM-derived alternatives.
  brand_colors?: { name: 'primary' | 'secondary' | 'accent'; hex: string }[]
  existing_logo_url?: string

  // Optional scene/backdrop direction injected into banner + profile-picture
  // image prompts (not logos). Lets admins say "villa interiors, yachts, pools"
  // instead of relying on the inspirations field to imply scenery.
  imagery_direction?: string

  // Optional admin overrides for the auto-generated tagline + CTA that get
  // rendered ON banners. When unset, the structured generator picks them.
  tagline_override?: string
  cta_override?: string
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
  // Rendered ON banners; also surfaced in BrandKitView with copy buttons so
  // admins can reuse them as marketing copy.
  tagline?: string
  cta?: string
  images: Record<ImageAssetId, ImageAssetRef>
}
