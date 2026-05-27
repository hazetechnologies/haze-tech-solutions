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

// ── gpt-4o-mini single-call prompt: bios + hashtags + handles + platform_priority ──

export const STRUCTURED_SCHEMA = {
  name: 'brand_kit_structured',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['bios', 'hashtags', 'handles', 'platform_priority', 'tagline', 'cta'],
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
      handles: {
        type: 'array',
        items: { type: 'string' },
        minItems: 5, maxItems: 5,
      },
      platform_priority: { type: 'string' },
      // 5-8 words. The brand promise/positioning phrase that goes ON the banner.
      tagline: { type: 'string', maxLength: 80 },
      // 2-4 words. Action verb phrase ("Book Now", "Get a Quote") that goes ON the banner.
      cta:     { type: 'string', maxLength: 24 },
    },
  },
} as const

export function buildStructuredSystemPrompt(): string {
  return [
    'You are a senior social media strategist. You write tight, on-brand copy.',
    'Always output ONLY the JSON specified by the schema. No markdown, no prose, no commentary.',
    'For bios: use plain text (no emoji unless the brand vibe is playful), respect platform character limits, lead with what the brand DOES, end with a soft CTA where space allows. LinkedIn bio (2000 chars max): write a professional company page "About" section with 2-3 short paragraphs covering what the company does, who it serves, and its key differentiators.',
    'For hashtags: mix 3 broad (>1M posts) + 4 niche (~100k posts) + 3 ultra-niche (<10k posts). All lowercase. No spaces. Brand-relevant.',
    'For handles (Path 3 only): 5 candidates the team can check for availability. Mix variants: brand name, brand+industry, brand+region/HQ, brand+function (e.g. "_official", "hq"), creative twist. Keep 3-30 chars, lowercase, alphanumeric + underscore only.',
    'For platform_priority (Path 3 only): one paragraph (max 80 words). Recommend ONE platform to launch first based on the audience and industry. Justify briefly.',
    'For tagline: a short brand promise / positioning phrase that gets rendered ON marketing banners. 5-8 words, title-cased or sentence case, NO emoji, NO trailing punctuation. Avoid the word "the". Should be memorable, evocative, and tied to what makes this brand distinct. Examples: "Luxury Living, Seamlessly Managed." — "Code That Compounds." — "Your AI Co-Pilot for Customer Conversations."',
    'For cta: a short action phrase rendered ON banners as a button label. 2-4 words, title case, NO emoji, NO trailing punctuation. Must match the brand\'s primary conversion action (buy, book, schedule, download, sign up). Examples: "Book Your Stay" — "Start Free Trial" — "Get a Quote" — "Schedule a Call".',
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
      ? 'This client is starting from scratch — generate handles + platform_priority.'
      : 'This client has existing accounts — set handles to ["existing"] and platform_priority to "(existing client — N/A)".',
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
  copy?: { tagline?: string; cta?: string },
): string {
  const paletteText = palette.map(c => `${c.name}: ${c.hex}`).join(', ')
  const baseStyle = `Brand: ${inputs.business_name}. Vibe: ${inputs.vibe.join(', ')}. Color palette: ${paletteText}. Style references: ${inputs.inspirations}.`

  // Scene direction only for banners + profile_picture. Logos must stay clean —
  // a yacht inside a logo is never what an admin meant when they typed "yachts".
  const isSceneAsset = assetId.startsWith('banner_') || assetId === 'profile_picture'
  const sceneSuffix = isSceneAsset && inputs.imagery_direction?.trim()
    ? ` Scene/backdrop: ${inputs.imagery_direction.trim()}`
    : ''

  // Tagline + CTA only get embedded into BANNERS, never into logos or the
  // profile picture (which gets cropped to a circle on most platforms and
  // shouldn't carry copy). When the admin overrides via the intake form
  // those win; otherwise we use what the structured generator produced.
  const tagline = (inputs.tagline_override ?? copy?.tagline ?? '').trim()
  const cta = (inputs.cta_override ?? copy?.cta ?? '').trim()
  const isBanner = assetId.startsWith('banner_')

  // Narrow banners (LinkedIn cover at 1128×191) have no vertical room to stack
  // tagline + CTA below the logo, so the model drops them entirely. Use a
  // horizontal layout instead: logo on the left, tagline + CTA stacked to its
  // right, all on one line. Tall banners (Instagram story) and roughly-square
  // ones (TikTok, profile) keep the default vertical stack below the logo.
  const isNarrowBanner = assetId === 'banner_linkedin_cover'
  const layoutDirective = isNarrowBanner
    ? `place the tagline and the CTA button stacked vertically to the RIGHT of the logo (logo on the left, copy on the right) — all on one horizontal row so they fit in a short-height banner`
    : `place the tagline immediately below the logo (smaller than the logo, high-contrast against the background) and the CTA button immediately below the tagline`

  const copySuffix = isBanner && (tagline || cta)
    ? ` MANDATORY text overlays rendered ON the banner — these are NOT decorative; they MUST appear. Spell every word EXACTLY as written, character-for-character, in a clean modern sans-serif typeface. Layout: ${layoutDirective}.` +
      (tagline ? ` (1) Tagline reads EXACTLY: "${tagline}". This is a required element.` : '') +
      (cta ? ` (2) Call-to-action reads EXACTLY: "${cta}" — render it as a SOLID PILL-SHAPED BUTTON filled with the brand accent color, with the CTA text in the brand light color centered inside. The CTA button is a REQUIRED element — do NOT omit it, do NOT replace it with plain text. If you skip the CTA button the banner is unusable.` : '') +
      ` Do NOT add any other words, slogans, taglines, addresses, phone numbers, dates, or watermarks anywhere on the banner.`
    : ''

  switch (assetId) {
    case 'logo_primary':
      return `Primary brand logo for "${inputs.business_name}". Clean modern logo design, ${inputs.vibe[0]} aesthetic, white background, scalable, high-contrast. ${baseStyle}`
    case 'logo_icon':
      return `Icon-only version of the "${inputs.business_name}" brand mark. Square format, no text, abstract or symbolic icon, white background, scalable. ${baseStyle}`
    case 'logo_monochrome':
      return `Monochrome (single-color) version of the "${inputs.business_name}" logo. Pure black on white background. ${baseStyle}`
    case 'profile_picture':
      return `Square social media profile picture for "${inputs.business_name}". Logo lockup centered, generous padding around edges, optimized for circular crop, brand colors. ${baseStyle}${sceneSuffix}`
    case 'banner_ig':
      return `Vertical Instagram story banner for "${inputs.business_name}". Hero composition, brand colors, ample empty space at top and bottom for text overlay. CRITICAL: the logo and any text must NEVER touch the canvas edges — leave at least 10% margin on all sides. ${baseStyle}${sceneSuffix}${copySuffix}`
    case 'banner_fb':
      return `Wide horizontal Facebook cover image for "${inputs.business_name}". Cinematic composition, brand colors, focal point centered, text-friendly negative space. CRITICAL: the logo and any text must NEVER touch the canvas edges — leave at least 10% margin on all sides. ${baseStyle}${sceneSuffix}${copySuffix}`
    case 'banner_yt':
      return `Wide YouTube channel banner for "${inputs.business_name}". 16:9 cinematic, brand colors, professional. CRITICAL safe-area rule: ALL logo + tagline + CTA content MUST fit inside a SMALL CENTERED block roughly 40% wide × 25% tall, positioned at the exact center of the canvas (50%/50%). The logo's vertical center MUST coincide with the canvas vertical center; the tagline + CTA sit just below the logo. Leave at least 20% of canvas height above the logo and 20% below the CTA as background scenery only. Everything outside the central block is background scenery — YouTube crops aggressively on mobile and TV, so content near edges is invisible to most viewers. Do NOT place any text or logo content in the top quarter or bottom quarter of the canvas. ${baseStyle}${sceneSuffix}${copySuffix}`
    case 'banner_x':
      return `Ultra-wide X (Twitter) header banner for "${inputs.business_name}". Horizontal panoramic composition, brand colors. CRITICAL: the logo must sit COMPLETELY inside the canvas with at least 12% margin from the top, bottom, and right edges — NEVER let any part of the logo touch or cross an edge. Position the logo in the right third, vertically centered. The left two-thirds is scenery. ${baseStyle}${sceneSuffix}${copySuffix}`
    case 'banner_tiktok':
      return `Square TikTok profile picture for "${inputs.business_name}". Bold, simple, high-contrast, instantly readable at small sizes. CRITICAL: keep the logo centered with at least 12% margin on all sides — TikTok crops to a circle. ${baseStyle}${sceneSuffix}${copySuffix}`
    case 'banner_linkedin_cover':
      return `Ultra-wide LinkedIn company page cover image for "${inputs.business_name}". Professional, clean horizontal composition, brand colors, subtle texture or gradient background, text-friendly negative space. CRITICAL: the logo must sit COMPLETELY inside the canvas with at least 15% margin from the top, bottom, and left edges — NEVER let any part of the logo touch or cross an edge. Position the logo in the left third, vertically centered. The right two-thirds is scenery. ${baseStyle}${sceneSuffix}${copySuffix}`
    default:
      return baseStyle
  }
}
