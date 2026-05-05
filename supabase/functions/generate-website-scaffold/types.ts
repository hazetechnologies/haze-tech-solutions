// supabase/functions/generate-website-scaffold/types.ts

export interface WebsiteProjectInputs {
  template_id: 'service-business' | 'local-business' | 'creative-portfolio' | 'saas-landing' | 'travel-agency'
  domain: string
  business_description: string
  services: string[]
  pages: string[]
  color_style_prefs: string
  use_brand_kit: boolean
}

export interface BrandKitContext {
  business_name: string
  palette: Array<{ name: string; hex: string; use: string }>
  voice_tone: string
}

export interface AiContent {
  hero:        { headline: string; subheadline: string; cta: string }
  about:       { heading: string; body: string }
  services:    Array<{ name: string; description: string }>
  contact_cta: { heading: string; body: string }
  meta:        { title: string; description: string }
  footer_tagline: string
}
