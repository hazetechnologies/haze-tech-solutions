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
): string {
  const paletteText = palette.map(c => `${c.name}: ${c.hex}`).join(', ')
  const baseStyle = `Brand: ${inputs.business_name}. Vibe: ${inputs.vibe.join(', ')}. Color palette: ${paletteText}. Style references: ${inputs.inspirations}.`

  // Scene direction drives banner + profile-picture backdrops.
  const isSceneAsset = assetId.startsWith('banner_') || assetId === 'profile_picture'
  const sceneSuffix = isSceneAsset && inputs.imagery_direction?.trim()
    ? ` Scene/backdrop: ${inputs.imagery_direction.trim()}`
    : ''

  // Banners are now SCENERY ONLY — the logo, tagline, and CTA are composited
  // deterministically afterward by compose-banner.ts at exact safe-area
  // coordinates. Asking gpt-image-2 to place them was unreliable (cropped
  // logos, invented opaque panels covering the scenery). So every banner
  // prompt forbids text/logos/panels and just asks for a clean photographic
  // backdrop with a calm, uncluttered focal zone for the overlay to sit on.
  const sceneryOnly = ` IMPORTANT: Generate ONLY a photographic background scene — absolutely NO text, NO words, NO letters, NO logos, NO badges, NO watermarks, and NO solid color panels or boxes anywhere. Keep the composition clean and softly lit with a calm, relatively uncluttered area near the center where branding will be overlaid later. Cinematic, premium, high-resolution photography.`

  switch (assetId) {
    case 'logo_primary': {
      const primaryHex = palette.find((c) => c.name === 'primary')?.hex || '#000000'
      return `Primary brand logo for "${inputs.business_name}". Clean modern logo design, ${inputs.vibe[0]} aesthetic, white background, scalable. CRITICAL color rule: the wordmark text "${inputs.business_name}" MUST be rendered in the PRIMARY brand color ${primaryHex} — NOT black, NOT the dark UI color, NOT navy. The icon/monogram can use the primary color or the accent color. The "dark" color in the palette is for UI body text only and must NEVER appear in this logo. ${baseStyle}`
    }
    case 'logo_icon':
      return `Icon-only version of the "${inputs.business_name}" brand mark. Square format, no text, abstract or symbolic icon, white background, scalable. ${baseStyle}`
    case 'logo_monochrome':
      return `Monochrome (single-color) version of the "${inputs.business_name}" logo. Pure black on white background. ${baseStyle}`
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
