// supabase/functions/generate-website-scaffold/types.ts

export interface WebsiteProjectInputs {
  // Deliberately `string`, not a union of ids.
  //
  // This function deploys to Deno from supabase/functions and cannot import
  // src/lib/websiteTemplates.js, so a union here would be a SECOND list that
  // has to be kept in step by hand — which is the exact bug this replaced:
  // PR #98 added `scroll-motion` to the portal picker and to neither the API
  // allowlist nor this union, and the flagship template 400'd for ~3 months.
  //
  // The real gate is isValidTemplateId() in api/website.js, which reads the
  // registry, and it runs before a row ever reaches this function. A bogus id
  // would 404 at GitHub's create-from-template call and land the project in
  // `failed` with that message, which is a clearer signal than a type that is
  // erased at runtime anyway.
  template_id: string
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
