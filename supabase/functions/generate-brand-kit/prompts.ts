// supabase/functions/generate-brand-kit/prompts.ts
import type { BrandKitInputs, ColorPaletteEntry } from './types.ts'

function clientContext(inputs: BrandKitInputs): string {
  const parts = [
    `Business name: ${inputs.business_name}`,
    inputs.business_description ? `Description: ${inputs.business_description}` : null,
    `Industry: ${inputs.industry}`,
    `Target audience: ${inputs.audience}`,
    `Brand vibe: ${inputs.vibe.join(', ')}`,
    `Color preference: ${inputs.color_preference}`,
    `Inspirations: ${inputs.inspirations}`,
    inputs.voice_tone_preference ? `Voice/tone preference: ${inputs.voice_tone_preference}` : null,
    inputs.goal ? `Goal: ${inputs.goal}` : null,
    inputs.challenge ? `Current challenge: ${inputs.challenge}` : null,
  ]
  return parts.filter(Boolean).join('\n')
}

export const STYLE_PRESETS: Record<string, string> = {
  auto: '',
  minimalist: 'Minimalist and clean: generous negative space, a restrained 2-3 color use, simple geometric forms, thin-to-medium sans-serif type, no clutter or ornamentation. Apple / Stripe restraint.',
  editorial: 'Bold and editorial: large confident typography, strong contrast, deliberate color blocking, magazine-style asymmetric composition, striking focal points.',
  luxury: 'Premium and luxury: elegant and understated, refined type (a tasteful serif or high-contrast sans), monochrome or metallic/gold accents, cinematic lighting, lots of breathing room, quietly expensive.',
  gradient_3d: 'Modern gradient / 3D: vibrant multi-stop gradients, glassy or subtly 3D elements, soft glow and depth, energetic and contemporary — the trendy premium-SaaS/tech look.',
}

export function resolveStylePreset(preset?: string): string {
  const g = preset ? STYLE_PRESETS[preset] : undefined
  return g && g.trim()
    ? g
    : 'Infer the most fitting visual style from the brand itself — its vibe, industry, audience, and inspirations.'
}

export interface ArtDirection {
  style_summary: string
  logo_style: string
  typography: string
  banner_imagery_style: string
  composition: string
}

export const EMPTY_ART_DIRECTION: ArtDirection = {
  style_summary: '', logo_style: '', typography: '', banner_imagery_style: '', composition: '',
}

// Tolerant parse of the art-director's JSON. Never throws — a bad response
// degrades to all-empty (prompts then behave exactly as before this feature).
export function parseArtDirection(text: string): ArtDirection {
  const out: ArtDirection = { ...EMPTY_ART_DIRECTION }
  if (!text || typeof text !== 'string') return out
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  if (s === -1 || e === -1 || e <= s) return out
  let obj: Record<string, unknown>
  try { obj = JSON.parse(text.slice(s, e + 1)) } catch { return out }
  for (const k of Object.keys(out) as (keyof ArtDirection)[]) {
    if (typeof obj[k] === 'string') out[k] = (obj[k] as string).trim()
  }
  return out
}

export function buildArtDirectorPrompt(
  inputs: BrandKitInputs,
  palette: ColorPaletteEntry[],
): { system: string; user: string } {
  const paletteText = palette.map((c) => `${c.name}: ${c.hex}`).join(', ')
  const styleGuidance = resolveStylePreset(inputs.style_preset)
  const system = 'You are an award-winning brand art director. Given a brand brief, produce a concrete, opinionated visual art-direction a designer and an image model can follow to make a cohesive, premium-looking logo and social banners. Output ONLY a single JSON object — no prose, no code fences — with exactly these keys: "style_summary", "logo_style", "typography", "banner_imagery_style", "composition". Each value is a concise, specific, visual directive (1-2 sentences), never generic filler.'
  const user = [
    `Brand: ${inputs.business_name}`,
    inputs.business_description ? `What it does: ${inputs.business_description}` : '',
    `Industry: ${inputs.industry}`,
    `Audience: ${inputs.audience}`,
    `Vibe: ${inputs.vibe.join(', ')}`,
    inputs.inspirations ? `Inspirations: ${inputs.inspirations}` : '',
    inputs.color_preference ? `Color preference: ${inputs.color_preference}` : '',
    `Palette: ${paletteText}`,
    `Design style to honor: ${styleGuidance}`,
    'Return the JSON object only.',
  ].filter(Boolean).join('\n')
  return { system, user }
}

// ── gpt-4o-mini single-call prompt: bios + hashtags + platform_priority ──

export const STRUCTURED_SCHEMA = {
  name: 'brand_kit_structured',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['bios', 'hashtags', 'platform_priority', 'tagline', 'cta', 'keywords', 'instagram_page_name', 'highlight_covers', 'services'],
    properties: {
      bios: {
        type: 'object',
        additionalProperties: false,
        required: ['instagram', 'tiktok', 'youtube', 'x', 'facebook', 'linkedin'],
        properties: {
          instagram: { type: 'string', maxLength: 150 },
          tiktok:    { type: 'string', maxLength: 80 },
          youtube:   { type: 'string', maxLength: 1000 },
          x:         { type: 'string', maxLength: 160 },
          facebook:  { type: 'string', maxLength: 255 },
          linkedin:  { type: 'string', maxLength: 2000 },
        },
      },
      hashtags: {
        type: 'array',
        items: { type: 'string', pattern: '^#[a-zA-Z0-9_]+$' },
        minItems: 10, maxItems: 10,
      },
      platform_priority: { type: 'string' },
      // 5-8 words. The brand promise/positioning phrase that goes ON the banner.
      tagline: { type: 'string', maxLength: 80 },
      // 2-4 words. Action verb phrase ("Book Now", "Get a Quote") that goes ON the banner.
      cta:     { type: 'string', maxLength: 24 },
      // 12-20 lowercase search terms a customer would type, drawn from the
      // industry + what the business does. Used as SEO/discovery keywords and to
      // seed the highlight-cover titles.
      keywords: {
        type: 'array',
        items: { type: 'string' },
        minItems: 12, maxItems: 20,
      },
      // The Instagram profile display NAME (the "Name" field, NOT the @username).
      // Must contain a searchable category term so the page ranks in IG search.
      instagram_page_name: { type: 'string', maxLength: 60 },
      // Exactly 5 Instagram Highlight covers. Each title is 1-2 words a visitor
      // taps (About, Tours, Reviews…) and must echo one keyword; keyword is the
      // matching search term.
      highlight_covers: {
        type: 'array',
        minItems: 5, maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'keyword'],
          properties: {
            title:   { type: 'string', maxLength: 18 },
            keyword: { type: 'string', maxLength: 40 },
          },
        },
      },
      // 3-6 SHORT (1-2 word) Title-Case service/offering labels — these become
      // the icon strip on the marketing cover (e.g. Yachts, Tours, Dining).
      services: {
        type: 'array',
        items: { type: 'string', maxLength: 20 },
        minItems: 3, maxItems: 6,
      },
    },
  },
} as const

export function buildStructuredSystemPrompt(): string {
  return [
    'You are a senior social media strategist. You write tight, on-brand copy.',
    'Always output ONLY the JSON specified by the schema. No markdown, no prose, no commentary.',
    'For bios: use plain text (no emoji unless the brand vibe is playful), respect platform character limits, lead with what the brand DOES, end with a soft CTA where space allows. ALWAYS include a bio for ALL SIX platforms — instagram, tiktok, youtube, x, facebook, linkedin — never omit any. LinkedIn bio (2000 chars max): write a professional company page "About" section with 2-3 short paragraphs covering what the company does, who it serves, and its key differentiators. YouTube bio (1000 chars max): write a channel "About" description — what the brand is about and what viewers/subscribers get from following, 1-2 short paragraphs.',
    'For hashtags: mix 3 broad (>1M posts) + 4 niche (~100k posts) + 3 ultra-niche (<10k posts). All lowercase. No spaces. Brand-relevant.',
    'For platform_priority (Path 3 only): one paragraph (max 80 words). Recommend ONE platform to launch first based on the audience and industry. Justify briefly.',
    'For tagline: a short brand promise / positioning phrase that gets rendered ON marketing banners. 5-8 words, title-cased or sentence case, NO emoji, NO trailing punctuation. Avoid the word "the". Should be memorable, evocative, and tied to what makes this brand distinct. Examples: "Luxury Living, Seamlessly Managed." — "Code That Compounds." — "Your AI Co-Pilot for Customer Conversations."',
    'For cta: a short action phrase rendered ON banners as a button label. 2-4 words, title case, NO emoji, NO trailing punctuation. Must match the brand\'s primary conversion action (buy, book, schedule, download, sign up). Examples: "Book Your Stay" — "Start Free Trial" — "Get a Quote" — "Schedule a Call".',
    'For keywords: 12-20 lowercase search terms a real customer would type into Instagram or Google to find this business. Derive them from the industry and what the business does — mix the core category, the location/region if any, and the specific products or services. Plain words/short phrases, NO "#", no duplicates. Example (a Florida tour brand): ["florida tours", "yacht charters", "key west excursions", "everglades tours", "miami boat tours", "florida vacation", "things to do in florida", "sunset cruises", "jet ski rentals", "snorkeling tours", "private boat charters", "miami nightlife", "family excursions", "fishing charters"].',
    'For instagram_page_name: the Instagram profile Name field (the bold display name, NOT the @username). Keep it under ~30 characters and ALWAYS append a searchable category term after the brand name so the profile surfaces in IG search — pattern "Brand | Searchable Category". Examples: "Florvania | Florida Tours" — "Acme | Austin Plumber" — "Lumen | Skincare".',
    'For highlight_covers: exactly 5 Instagram Story Highlight covers. Each has a "title" (1-2 words, Title Case, that a visitor taps — e.g. About, Tours, Reviews, Booking, Gallery, Menu, FAQ) and a "keyword" (the matching search term from the keywords list, or closely related). Each title MUST contain or clearly echo a keyword/topic so the highlights double as search signals. Choose the 5 most useful highlights for THIS specific business.',
    'For services: 3-6 SHORT (1-2 word) Title-Case labels naming the brand\'s core offerings — these render as an icon strip on the marketing cover, so each must be concrete and easy to draw as a simple icon. Example (a Florida travel brand): ["Yachts", "Tours", "Excursions", "Cruises", "Dining"]. A plumber: ["Repairs", "Installs", "Drains", "Heaters", "Emergency"].',
  ].join('\n\n')
}

export function buildStructuredUserPrompt(inputs: BrandKitInputs): string {
  const isCold = inputs.path === 'cold_start'
  return [
    'Generate the structured brand assets for this client:',
    '',
    clientContext(inputs),
    '',
    isCold
      ? 'This client is starting from scratch — generate platform_priority.'
      : 'This client has existing accounts — set platform_priority to "(existing client — N/A)".',
  ].join('\n')
}

// ── Claude Opus single-call prompts ──

export function buildVoiceTonePrompt(inputs: BrandKitInputs): { system: string; user: string } {
  return {
    system: 'You are a senior brand strategist who writes voice-and-tone guides. Output ONLY clean Markdown — no code fences, no preamble.',
    user: [
      'Write a 1-page voice & tone guide for this brand.',
      '',
      'Structure:',
      '## Voice',
      '- 3-5 adjectives describing the brand voice',
      '- 1 paragraph on the personality',
      '',
      '## Tone',
      '- 1 paragraph on how tone shifts by context (educational vs promotional vs response)',
      '',
      "## Do / Don't",
      '- 5 do bullets',
      "- 5 don't bullets (with brief example phrases)",
      '',
      'Brand context:',
      clientContext(inputs),
    ].join('\n'),
  }
}

export function buildContentPillarsPrompt(inputs: BrandKitInputs): { system: string; user: string } {
  return {
    system: 'You are a senior content strategist. Output ONLY valid JSON matching this schema: { "pillars": [{ "name": "...", "description": "..." }] }. No markdown, no preamble.',
    user: [
      'Define 4 content pillars for this brand.',
      'Each pillar: short name (2-4 words) + 1-2 sentence description of what content falls under it.',
      'Pillars should cover educational, behind-the-scenes, social proof, and promotional content respectively (adapted to the brand).',
      '',
      'Brand context:',
      clientContext(inputs),
    ].join('\n'),
  }
}

export function buildColorPalettePrompt(inputs: BrandKitInputs): { system: string; user: string } {
  return {
    system: 'You are a senior brand designer. Output ONLY valid JSON matching this schema: { "palette": [{ "name": "primary"|"secondary"|"accent"|"dark"|"light", "hex": "#RRGGBB", "use": "..." }] }. Exactly 5 colors in that exact order. No markdown, no preamble.',
    user: [
      'Pick a 5-color palette for this brand.',
      'Constraints: WCAG AA contrast for dark text on light + light text on dark. Accent color should be distinct and confident. Match the brand vibe and color preference.',
      '',
      'Brand context:',
      clientContext(inputs),
    ].join('\n'),
  }
}

// ── Image prompts (gpt-image-2) ──

export function buildImagePrompt(
  assetId: string,
  inputs: BrandKitInputs,
  palette: ColorPaletteEntry[],
  art?: ArtDirection | null,
): string {
  const paletteText = palette.map(c => `${c.name}: ${c.hex}`).join(', ')
  const baseStyle = `Brand: ${inputs.business_name}. Vibe: ${inputs.vibe.join(', ')}. Color palette: ${paletteText}. Style references: ${inputs.inspirations}.`

  // Scene direction drives banner + profile-picture backdrops.
  const isSceneAsset = assetId.startsWith('banner_') || assetId === 'profile_picture'
  const sceneSuffix = isSceneAsset && inputs.imagery_direction?.trim()
    ? ` Scene/backdrop: ${inputs.imagery_direction.trim()}`
    : ''

  const hasLogoArt = !!art && !!(art.style_summary || art.logo_style || art.typography)
  const logoArt = hasLogoArt
    ? ` Style direction — overall: ${art!.style_summary}; logo form: ${art!.logo_style}; typography: ${art!.typography}.`
    : ''
  const hasBannerArt = !!art && !!(art.banner_imagery_style || art.composition)
  const bannerArt = hasBannerArt
    ? ` Style direction — imagery: ${art!.banner_imagery_style}; composition: ${art!.composition}.`
    : ''

  // Banners are now SCENERY ONLY — the logo, tagline, and CTA are composited
  // deterministically afterward by compose-banner.ts at exact safe-area
  // coordinates. Asking gpt-image-2 to place them was unreliable (cropped
  // logos, invented opaque panels covering the scenery). So every banner
  // prompt forbids text/logos/panels and just asks for a clean photographic
  // backdrop with a calm, uncluttered focal zone for the overlay to sit on.
  const sceneryOnly = ` IMPORTANT: Generate ONLY a photographic background scene — absolutely NO text, NO words, NO letters, NO logos, NO badges, NO watermarks, and NO solid color panels or boxes anywhere. Keep the composition clean and softly lit with a calm, relatively uncluttered area near the center where branding will be overlaid later. Cinematic, premium, high-resolution photography.` + bannerArt

  switch (assetId) {
    case 'logo_option_1': {
      const primaryHex = palette.find((c) => c.name === 'primary')?.hex || '#000000'
      const accentHex = palette.find((c) => c.name === 'accent')?.hex || primaryHex
      const secondaryHex = palette.find((c) => c.name === 'secondary')?.hex || accentHex
      return `Logo design OPTION 1 of 3 DISTINCT concepts for "${inputs.business_name}" — a clean modern HORIZONTAL lockup: a simple brand icon/monogram to the LEFT of the wordmark "${inputs.business_name}". This is a COMPLETE logo (icon + wordmark), NOT an icon-only mark. ${inputs.vibe[0]} aesthetic, on a fully transparent background (no background fill), scalable. USE THE FULL BRAND PALETTE — this must be a multi-color logo, NOT a single color: render the wordmark "${inputs.business_name}" in the PRIMARY color ${primaryHex}, and make the icon/monogram prominently use the ACCENT color ${accentHex} (the secondary color ${secondaryHex} may be a supporting tone). Never use black, navy, or a dark UI color. ${baseStyle}${logoArt}`
    }
    case 'logo_option_2': {
      const primaryHex = palette.find((c) => c.name === 'primary')?.hex || '#000000'
      const accentHex = palette.find((c) => c.name === 'accent')?.hex || primaryHex
      const secondaryHex = palette.find((c) => c.name === 'secondary')?.hex || accentHex
      return `Logo design OPTION 2 of 3 DISTINCT concepts for "${inputs.business_name}" — clearly DIFFERENT from option 1: a STACKED lockup with a distinctive symbolic icon ABOVE the centered wordmark "${inputs.business_name}". Use a different icon idea and a different typographic treatment. This is a COMPLETE logo (icon + wordmark), NOT an icon-only mark. ${inputs.vibe[0]} aesthetic, on a fully transparent background (no background fill), scalable. USE THE FULL BRAND PALETTE — this must be a multi-color logo, NOT a single color: render the wordmark in the PRIMARY color ${primaryHex}, and build the icon around the ACCENT color ${accentHex} (with ${secondaryHex} as an optional supporting tone). Never use black, navy, or a dark UI color. ${baseStyle}${logoArt}`
    }
    case 'logo_option_3': {
      const primaryHex = palette.find((c) => c.name === 'primary')?.hex || '#000000'
      const accentHex = palette.find((c) => c.name === 'accent')?.hex || primaryHex
      const secondaryHex = palette.find((c) => c.name === 'secondary')?.hex || accentHex
      return `Logo design OPTION 3 of 3 DISTINCT concepts for "${inputs.business_name}" — a THIRD distinct direction: an emblem/badge or lettermark-monogram style that STILL includes the full wordmark "${inputs.business_name}". Visibly different icon idea and composition from options 1 and 2. This is a COMPLETE logo (icon + wordmark), NOT an icon-only mark. ${inputs.vibe[0]} aesthetic, on a fully transparent background (no background fill), scalable. USE THE FULL BRAND PALETTE — this must be a multi-color logo, NOT a single color: render the wordmark in the PRIMARY color ${primaryHex}, and use the ACCENT color ${accentHex} for the icon/emblem detail (the secondary color ${secondaryHex} may support it). Never use black, navy, or a dark UI color. ${baseStyle}${logoArt}`
    }
    case 'logo_primary': {
      const primaryHex = palette.find((c) => c.name === 'primary')?.hex || '#000000'
      return `Primary brand logo for "${inputs.business_name}". Clean modern logo design, ${inputs.vibe[0]} aesthetic, on a fully transparent background (no background fill), scalable. CRITICAL color rule: the wordmark text "${inputs.business_name}" MUST be rendered in the PRIMARY brand color ${primaryHex} — NOT black, NOT the dark UI color, NOT navy. The icon/monogram can use the primary color or the accent color. The "dark" color in the palette is for UI body text only and must NEVER appear in this logo. ${baseStyle}${logoArt}`
    }
    case 'logo_icon':
      return `Icon-only version of the "${inputs.business_name}" brand mark. Square format, no text, abstract or symbolic icon, on a fully transparent background (no background fill), scalable. ${baseStyle}${logoArt}`
    case 'logo_monochrome':
      return `Monochrome (single-color) version of the FULL primary logo for "${inputs.business_name}". This is NOT an icon-only mark — it MUST include the complete wordmark text "${inputs.business_name}" together with the brand icon, in the same lockup and composition as the primary logo. Render the entire logo (icon + wordmark) in ONE single solid color, pure black #000000, with no gradients and no second color, on a fully transparent background (no background fill), scalable. ${baseStyle}${logoArt}`
    case 'profile_picture':
      return `Square background scene for "${inputs.business_name}" social profile. Cinematic, brand colors, calm uncluttered center. ${baseStyle}${sceneSuffix}${sceneryOnly}`
    case 'banner_ig':
      return `Vertical (9:16) background scene for an Instagram story for "${inputs.business_name}". Hero composition, brand colors, calm uncluttered center band. ${baseStyle}${sceneSuffix}${sceneryOnly}`
    case 'banner_fb':
      return `Wide horizontal background scene for a Facebook cover for "${inputs.business_name}". Cinematic, brand colors, calm uncluttered center. ${baseStyle}${sceneSuffix}${sceneryOnly}`
    case 'banner_yt':
      return `Wide 16:9 cinematic background scene for a YouTube banner for "${inputs.business_name}". Brand colors, professional. Keep the CENTER of the frame calm and relatively uncluttered (this central strip is where branding gets overlaid); richer scenery can sit toward the top and bottom edges. ${baseStyle}${sceneSuffix}${sceneryOnly}`
    case 'banner_x':
      return `Ultra-wide horizontal panoramic background scene for an X (Twitter) header for "${inputs.business_name}". Brand colors. Keep the right-center area calm and uncluttered for overlaid branding. ${baseStyle}${sceneSuffix}${sceneryOnly}`
    case 'banner_tiktok':
      return `Square background scene for a TikTok profile for "${inputs.business_name}". Brand colors, simple, calm uncluttered center. ${baseStyle}${sceneSuffix}${sceneryOnly}`
    case 'banner_linkedin_cover':
      return `Ultra-wide horizontal background scene for a LinkedIn company cover for "${inputs.business_name}". Professional, brand colors, subtle gradient or texture. Keep the left-center area calm and uncluttered for overlaid branding. ${baseStyle}${sceneSuffix}${sceneryOnly}`
    default:
      return baseStyle
  }
}

// ── Instagram Highlight cover prompt (whole-image gpt-image-1, opaque) ──
//
// Unlike banners (KIE scenery + deterministic overlay), a highlight cover is a
// small, simple, icon-forward design best rendered as ONE complete gpt-image-1
// image — the same way ChatGPT produces them. The short title text is baked in
// by the model; everything is centered inside a safe circle because Instagram
// crops highlight covers to a small circle.
export function buildHighlightCoverPrompt(
  cover: { title: string; keyword: string },
  inputs: BrandKitInputs,
  palette: ColorPaletteEntry[],
  art?: ArtDirection | null,
): string {
  const primary = palette.find((c) => c.name === 'primary')?.hex || '#0F172A'
  const secondary = palette.find((c) => c.name === 'secondary')?.hex || primary
  const accent = palette.find((c) => c.name === 'accent')?.hex || primary
  const light = palette.find((c) => c.name === 'light')?.hex || '#FFFFFF'
  const title = (cover.title || '').trim()
  const keyword = (cover.keyword || '').trim()
  // Pin the FONT so every cover in the set matches. Prefer the art-director's
  // typography; otherwise a sensible default tied to the brand vibe. (The old
  // prompt hardcoded "sans-serif" AND appended a possibly-serif art direction —
  // the two conflicted and the set came out inconsistent.)
  const typography = (art?.typography?.trim()) || `an elegant premium ${inputs.vibe[0] || 'modern'} serif`
  const overall = art?.style_summary?.trim() ? ` Overall aesthetic: ${art.style_summary.trim()}.` : ''
  // Everything below is pinned (background, text color, layout, line weight) so
  // the 5 covers render as a uniform SET even though each is generated
  // independently with no shared reference image.
  return [
    `Instagram Story Highlight cover for "${inputs.business_name}" (${inputs.industry}) — ONE of a MATCHING SET of 5 covers that MUST look identical in style; only the icon subject and the single word change between covers.`,
    `Background (use this EXACT treatment on every cover): a smooth diagonal gradient from ${primary} at the top-left to ${secondary} at the bottom-right, with a soft, slightly darker circular glow centered in the frame.`,
    `Icon: a SINGLE minimal thin-line pictogram of "${keyword || title}", centered in the UPPER-MIDDLE, drawn in the accent color ${accent} with a consistent medium line weight — line art only, no fills, no photo, no 3D, exactly one icon.`,
    `Title: the single word "${title}" centered directly BELOW the icon, in ${typography}, colored ${light} (NOT the accent color, NOT a second color), correctly spelled, large and clearly legible.`,
    `Layout: the icon and word are grouped in the exact center of the frame with generous, even padding on all sides — Instagram crops this to a small circle, so keep everything well inside the center and nothing near the corners or edges.`,
    `Flat, minimal, premium. Brand palette only (primary ${primary}, secondary ${secondary}, accent ${accent}, light ${light}).`,
    `IMPORTANT: exactly ONE icon and ONLY the single word "${title}" as text — no other words, no letters, no numbers, no photographic imagery, no busy background, no logos, no watermarks, no borders or frames.${overall}`,
  ].join(' ')
}

// ── Cinematic cover banner prompt (whole-image gpt-image-1 IMAGE EDIT) ──
//
// This is the "$100k campaign" path the user asked for: the banner is ONE
// cohesive photorealistic scene with the uploaded logo BLENDED into the center
// (not a KIE scenery backdrop with a pasted-on overlay). Built as a professional
// creative brief in the user's 12-part order: Mission → Audience → Emotion →
// Story → Scene → Hero Elements → Composition → Branding → Colors → Lighting →
// Style → Quality Rules → Final Creative Direction. Driven by the brand inputs
// so it's generic across brands (swap mission/audience/story/heroes; the
// structure stays). Consumed by the /images/edits call with the logo as input.
export function normalizeUrlForDisplay(url?: string): string {
  const u = (url || '').trim()
  if (!u) return ''
  return u.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

const COVER_ORIENTATION: Record<string, string> = {
  banner_ig: 'a vertical 9:16 portrait Instagram story cover',
  banner_fb: 'a wide horizontal Facebook cover',
  banner_yt: 'a wide 16:9 cinematic YouTube channel banner',
  banner_x: 'an ultra-wide horizontal X (Twitter) header',
  banner_linkedin_cover: 'an ultra-wide horizontal LinkedIn company cover',
}

export function buildCinematicCoverPrompt(
  assetId: string,
  inputs: BrandKitInputs,
  palette: ColorPaletteEntry[],
  art?: ArtDirection | null,
  branding?: { website?: string; tagline?: string },
  // backgroundOnly = render the SCENE with NO baked logo/text, keeping the
  // center calm — used for YouTube, where the exact logo + URL are composited
  // into the 1546×423 safe strip afterward (a hard guarantee the model can't give).
  opts?: { backgroundOnly?: boolean },
): string {
  const orientation = COVER_ORIENTATION[assetId] || 'a premium social media cover'
  const isYouTube = assetId === 'banner_yt'
  const backgroundOnly = !!opts?.backgroundOnly
  const vibe = inputs.vibe.join(', ')
  const paletteText = palette.map((c) => `${c.name} ${c.hex}`).join(', ')
  const website = normalizeUrlForDisplay(branding?.website)
  const tagline = (branding?.tagline || '').trim()

  // Scene + hero elements come from the admin's imagery_direction / the
  // art-director's imagery style; otherwise the model infers an aspirational
  // scene from the industry + audience.
  const sceneDir = [inputs.imagery_direction?.trim(), art?.banner_imagery_style?.trim()]
    .filter(Boolean).join('; ')
  const sceneLine = sceneDir
    ? `Build the environment from this direction: ${sceneDir}.`
    : `Build an aspirational, premium real-world environment that best represents ${inputs.industry} for this audience.`

  // 8. Branding — how the logo + text appear.
  const brandingText = website
    ? `Below the logo, display "${website}" in elegant modern typography, correctly spelled.`
    : tagline
      ? `Below the logo, display the tagline "${tagline}" in elegant typography, correctly spelled.`
      : `Keep clean, uncluttered space around the logo — no other text.`

  const overall = art?.style_summary?.trim() ? ` Overall art direction: ${art.style_summary.trim()}.` : ''

  // Background-only (YouTube): no baked logo/text; the exact logo + URL are
  // composited into the safe strip afterward.
  if (backgroundOnly) {
    return [
      `MISSION: Create ${orientation} BACKGROUND for "${inputs.business_name}", a ${vibe} ${inputs.industry} brand${inputs.business_description ? ` — ${inputs.business_description}` : ''}. A premium cinematic scene; the brand logo will be added separately.`,
      `AUDIENCE: It must impress ${inputs.audience}.`,
      `EMOTION: Viewers should feel ${vibe}, inspired and drawn in.`,
      `STORY: ${inputs.business_description ? inputs.business_description : `Show the best of what ${inputs.business_name} delivers`} — one cohesive scene.`,
      `SCENE: ${sceneLine}`,
      `HERO ELEMENTS: Feature the signature subjects of this brand as the stars (from the direction above), rendered beautifully and realistically. No duplicated or floating objects.`,
      `COMPOSITION: Wide, balanced, immersive. Keep the CENTER of the frame — a horizontal band across the middle (roughly the middle 60% of the width and middle 30% of the height) — CALM and relatively uncluttered, softly lit, so the brand logo and website can be overlaid there afterward and stay legible. Put the richest scenery, hero elements and sky ABOVE, BELOW and to the SIDES of that central band.`,
      `BRANDING: Render ABSOLUTELY NO logo, wordmark, text, letters, numbers, URL, watermark or UI panels anywhere. This is a clean photographic scene only.`,
      `COLORS: Use this luxury brand palette — ${paletteText}${inputs.color_preference ? ` (${inputs.color_preference})` : ''}. Rich, harmonious, on-brand.`,
      `LIGHTING: Golden-hour, cinematic volumetric sunlight, HDR, soft rim lighting, warm highlights, deep shadows, gentle lens bloom and atmospheric haze, natural reflections.`,
      `STYLE: Ultra-realistic, photorealistic, 8K HDR — luxury tourism/commercial-advertising quality, cinematic award-winning photography${inputs.inspirations ? `, in the spirit of ${inputs.inspirations}` : ''}.${overall}`,
      `QUALITY: Every object highly detailed and razor sharp. No clutter, no floating objects, no duplicated people, perfect perspective, natural lighting, NO AI artifacts. Looks like a $100,000 campaign.`,
      `FINAL DIRECTION: A single cohesive cinematic scene worthy of an international campaign — not a collage. Keep the middle open and calm for the branding that follows.`,
    ].join('\n')
  }

  return [
    // 1. Mission
    `MISSION: Create ${orientation} for "${inputs.business_name}", a ${vibe} ${inputs.industry} brand${inputs.business_description ? ` — ${inputs.business_description}` : ''}. This is a premium marketing hero image.`,
    // 2. Audience
    `AUDIENCE: It must impress ${inputs.audience}.`,
    // 3. Emotion
    `EMOTION: Viewers should feel ${vibe}, inspired and drawn in — as if they are already experiencing what this brand offers. Emotion matters more than any single object.`,
    // 4. Main Story
    `STORY: The image tells ONE cohesive story${inputs.business_description ? `: ${inputs.business_description}` : ` about the best of what ${inputs.business_name} delivers`}. Every element works together toward that story.`,
    // 5. Scene
    `SCENE: ${sceneLine}`,
    // 6. Hero Elements
    `HERO ELEMENTS: Feature the signature subjects of this brand as the stars of the scene (drawn from the direction above), rendered beautifully and realistically. No duplicated or floating objects.`,
    // 7. Composition
    `COMPOSITION: Perfectly balanced. Reserve the CENTER for the brand identity with generous breathing room; arrange the scene and hero elements around it so every line leads the eye toward the center. Open sky and light toward the top; the ground/water/floor and the website text toward the bottom.`,
    // 7b. YouTube safe zone — critical, only for banner_yt.
    ...(isYouTube ? [`YOUTUBE SAFE ZONE (critical): the final banner is 2560×1440 but only the CENTERED 1546×423 region is guaranteed visible on every device (TV, desktop, mobile). The logo + the website text together must be COMPACT and sit ENTIRELY inside that central band: size the whole brand lockup to occupy at most the middle ~45% of the width and — most importantly — at most the middle ~28% of the HEIGHT (about a fifth-to-a-quarter of the image tall), vertically centered, with clear margin above and below it. Do NOT enlarge the logo to fill the frame — keep it small and centered. Fill the generous remaining space ABOVE and BELOW (open sky at top, water/scenery at bottom) and to the left and right with the cinematic scene that can be safely cropped. Nothing important in the outer thirds or near any edge; the compact centered lockup must read perfectly even if everything outside the band is cut off.`] : []),
    // 8. Branding
    `BRANDING: Use the uploaded logo, placed in the exact center and BLENDED naturally into the artwork — it must NOT look pasted on. It should catch the eye first while staying integrated. ${brandingText}`,
    // 9. Colors
    `COLORS: Use this luxury brand palette — ${paletteText}${inputs.color_preference ? ` (${inputs.color_preference})` : ''}. Keep colors rich, harmonious and on-brand.`,
    // 10. Lighting
    `LIGHTING: Golden-hour, cinematic volumetric sunlight, HDR, soft rim lighting, warm highlights, deep shadows, gentle lens bloom and atmospheric haze, natural reflections.`,
    // 11. Style
    `STYLE: Ultra-realistic, photorealistic, 8K HDR — luxury tourism/commercial-advertising quality, magazine-cover polish, cinematic and award-winning photography${inputs.inspirations ? `, in the spirit of ${inputs.inspirations}` : ''}.${overall}`,
    // 12. Quality Rules
    `QUALITY: Every object highly detailed and razor sharp. No clutter, no random floating objects, no duplicated people, perfect perspective, balanced composition, professional typography, natural lighting. It should look like it cost $100,000 to produce, with NO AI artifacts.`,
    // Final Creative Direction
    `FINAL DIRECTION: Design this as the hero image for the homepage of a billion-dollar ${inputs.industry} brand. Every element should naturally guide the viewer's eye toward the center logo while showcasing what makes ${inputs.business_name} exceptional. Cohesive, immersive, elegant, worthy of an international campaign. Do NOT make it look like a collage — every object belongs naturally within the same single cinematic scene.`,
  ].join('\n')
}

// Cover img2img prompt (KIE gpt-image-2-image-to-image). The client's EXACT logo
// is passed as the reference image; this prompt tells the model to KEEP the logo
// verbatim, blend it into a cinematic scene, and bake the EXACT text + a service
// icon strip + URL badge (the ChatGPT-cover style the client asked for). Every
// string is fed VERBATIM so the model stops inventing/garbling words. For
// YouTube the lockup is confined to a compact centered cluster because a
// deterministic safe-zone fit (fitToYouTubeSafeZone) runs on the result.
export function buildCoverImg2ImgPrompt(
  assetId: string,
  inputs: BrandKitInputs,
  palette: ColorPaletteEntry[],
  art: ArtDirection | null | undefined,
  branding: { website?: string } | undefined,
  services: string[],
  // Fraction (0..1) of the GENERATED image's height that survives the
  // center-crop to this asset's final dimensions. Ultra-wide covers (X ≈ 0.59,
  // LinkedIn ≈ 0.30) crop away the top and bottom, so the whole lockup must be
  // confined to that central band or it gets clipped. Omit / 1 = no crop.
  safeHeightPct?: number,
): string {
  const orientation = COVER_ORIENTATION[assetId] || 'a premium social media cover'
  const isVertical = assetId === 'banner_ig'
  const website = normalizeUrlForDisplay(branding?.website)
  const svc = (services || []).map((s) => s.trim()).filter(Boolean).slice(0, 6)
  const svcUpper = svc.map((s) => s.toUpperCase())
  const paletteText = palette.map((c) => `${c.name} ${c.hex}`).join(', ')

  const sceneDir = [inputs.imagery_direction?.trim(), art?.banner_imagery_style?.trim()].filter(Boolean).join('; ')
  const sceneLine = sceneDir
    ? `Build the environment from this direction: ${sceneDir}.`
    : `Build an aspirational, premium, photoreal environment that best represents ${inputs.industry} for this audience, with a few lifestyle vignettes of the experience.`

  const iconStrip = svc.length >= 3
    ? `SERVICE ICON STRIP — a horizontal semi-transparent deep-navy bar with ${svc.length} evenly-spaced thin-line icons, each with a label underneath, in THIS exact order and spelling: ${svcUpper.map((s) => `"${s}"`).join(', ')}. Give each a simple, fitting line icon.`
    : ''
  const serviceLine = svc.length >= 3 ? `a thin line spelled EXACTLY: "${svcUpper.join(' · ')}"` : ''
  const urlBadge = website ? `a small rounded deep-navy badge with a white globe icon and the text spelled EXACTLY: "${website}"` : ''

  // Ultra-wide covers are rendered at 16:9 then center-cropped to a long
  // letterbox, so anything outside the central height band is clipped. When the
  // surviving band is meaningfully smaller than the frame, tell the model to
  // pack the entire lockup into that band as a compact horizontal cluster.
  const cropSafe = !isVertical && typeof safeHeightPct === 'number' && safeHeightPct < 0.72
  const bandPct = Math.max(15, Math.round((safeHeightPct ?? 1) * 100) - 8)
  const layoutLine = isVertical
    ? 'LAYOUT: stack the brand lockup across the upper-middle; keep the lower half mostly scenery.'
    : cropSafe
      ? `LAYOUT (CROP-SAFE, CRITICAL): this banner is cropped to a wide letterbox — only the central ${bandPct}% of the image HEIGHT survives the crop; everything above and below is cut off. Arrange the ENTIRE brand lockup (logo, wordmark${serviceLine ? ', the services line' : ''}${iconStrip ? ', the service icon strip' : ''}${urlBadge ? ', the URL badge' : ''}) as ONE COMPACT, primarily HORIZONTAL cluster, vertically centered and kept ENTIRELY within that central ${bandPct}% band — NOT a tall vertical stack. Place cinematic scenery you can afford to lose ABOVE and BELOW the band.`
      : 'LAYOUT: center the brand lockup with generous scenery around it.'

  return [
    `Design a premium, ultra-realistic ${orientation} for "${inputs.business_name}", a ${inputs.vibe.join(', ')} ${inputs.industry} brand${inputs.business_description ? ` — ${inputs.business_description}` : ''}. A high-end marketing hero image in the style of a $100,000 advertising campaign.`,
    `SCENE (photoreal, golden-hour, 8K HDR, cinematic): ${sceneLine} ONE cohesive immersive scene, NOT a collage.`,
    layoutLine,
    `LOGO — the PROVIDED image is the brand's FINISHED logo. Reproduce it EXACTLY as provided: do NOT redraw, restyle, recolor, distort, crop or re-letter the emblem or wordmark; keep every letter and mark pixel-accurate. Blend it into the scene with matching light and a soft realistic shadow so it looks designed-in, not pasted. Make it the centerpiece of the lockup.`,
    `EXACT TEXT — render every string below spelled EXACTLY, verbatim, with NO substitutions and NO invented or extra words:`,
    `- the wordmark reads exactly "${inputs.business_name}"${serviceLine ? `\n- under the wordmark, ${serviceLine}` : ''}${urlBadge ? `\n- ${urlBadge}, placed in a lower corner` : ''}`,
    iconStrip,
    `COLORS: use this brand palette — ${paletteText}${inputs.color_preference ? ` (${inputs.color_preference})` : ''}. Rich, harmonious, on-brand.`,
    `LIGHTING: golden-hour, cinematic volumetric light, HDR, soft rim light, warm highlights, gentle bloom, natural reflections.`,
    `QUALITY: razor sharp, correct spelling everywhere, professional typography, no watermarks, no duplicated people, no extra text beyond what is specified, no AI artifacts.${art?.style_summary ? ` Art direction: ${art.style_summary.trim()}.` : ''}`,
  ].filter(Boolean).join('\n')
}
