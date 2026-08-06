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

  // Optional named visual style preset that guides the art-director prompt
  // (see prompts.ts STYLE_PRESETS). Unset or 'auto' infers style from the
  // rest of the brand brief instead.
  style_preset?: 'auto' | 'minimalist' | 'editorial' | 'luxury' | 'gradient_3d'
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
  // 3 distinct full-logo designs the client picks from (the approval gate).
  | 'logo_option_1'
  | 'logo_option_2'
  | 'logo_option_3'
  // The chosen design (copied from the picked option on approval) + derived marks.
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
  // 5 Instagram Highlight covers — whole-image gpt-image-1 designs (not KIE),
  // each baking in a short title drawn from the brand's search keywords.
  | 'highlight_cover_1'
  | 'highlight_cover_2'
  | 'highlight_cover_3'
  | 'highlight_cover_4'
  | 'highlight_cover_5'

export interface BrandKitAssets {
  bios: { instagram: string; tiktok: string; youtube: string; x: string; facebook: string; linkedin: string }
  voice_tone: string                       // markdown
  hashtags: string[]
  content_pillars: ContentPillar[]
  handles?: string[]                        // Path 3 only
  platform_priority?: string                // Path 3 only
  color_palette: ColorPaletteEntry[]
  art_direction?: {
    style_summary: string
    logo_style: string
    typography: string
    banner_imagery_style: string
    composition: string
  }
  // Rendered ON banners; also surfaced in BrandKitView with copy buttons so
  // admins can reuse them as marketing copy.
  tagline?: string
  cta?: string
  // Searchable SEO/discovery keywords derived from industry + what the business
  // does. Also seed the highlight-cover titles.
  keywords?: string[]
  // The Instagram profile display NAME (not the @username) — includes a
  // searchable category term so the page ranks in IG search.
  instagram_page_name?: string
  // Specs for the 5 Instagram Highlight covers: each title contains a keyword.
  // The rendered images live in images.highlight_cover_1..5.
  highlight_covers?: { title: string; keyword: string }[]
  images: Record<ImageAssetId, ImageAssetRef>
}
