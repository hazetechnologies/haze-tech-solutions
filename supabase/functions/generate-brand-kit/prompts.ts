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
    required: ['bios', 'hashtags', 'handles', 'platform_priority'],
    properties: {
      bios: {
        type: 'object',
        additionalProperties: false,
        required: ['instagram', 'tiktok', 'youtube', 'x', 'facebook'],
        properties: {
          instagram: { type: 'string', maxLength: 150 },
          tiktok:    { type: 'string', maxLength: 80 },
          youtube:   { type: 'string', maxLength: 1000 },
          x:         { type: 'string', maxLength: 160 },
          facebook:  { type: 'string', maxLength: 255 },
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
    },
  },
} as const

export function buildStructuredSystemPrompt(): string {
  return [
    'You are a senior social media strategist. You write tight, on-brand copy.',
    'Always output ONLY the JSON specified by the schema. No markdown, no prose, no commentary.',
    'For bios: use plain text (no emoji unless the brand vibe is playful), respect platform character limits, lead with what the brand DOES, end with a soft CTA where space allows.',
    'For hashtags: mix 3 broad (>1M posts) + 4 niche (~100k posts) + 3 ultra-niche (<10k posts). All lowercase. No spaces. Brand-relevant.',
    'For handles (Path 3 only): 5 candidates the team can check for availability. Mix variants: brand name, brand+industry, brand+region/HQ, brand+function (e.g. "_official", "hq"), creative twist. Keep 3-30 chars, lowercase, alphanumeric + underscore only.',
    'For platform_priority (Path 3 only): one paragraph (max 80 words). Recommend ONE platform to launch first based on the audience and industry. Justify briefly.',
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

export function buildImagePrompt(assetId: string, inputs: BrandKitInputs, palette: ColorPaletteEntry[]): string {
  const paletteText = palette.map(c => `${c.name}: ${c.hex}`).join(', ')
  const baseStyle = `Brand: ${inputs.business_name}. Vibe: ${inputs.vibe.join(', ')}. Color palette: ${paletteText}. Style references: ${inputs.inspirations}.`

  switch (assetId) {
    case 'logo_primary':
      return `Primary brand logo for "${inputs.business_name}". Clean modern logo design, ${inputs.vibe[0]} aesthetic, white background, scalable, high-contrast. ${baseStyle}`
    case 'logo_icon':
      return `Icon-only version of the "${inputs.business_name}" brand mark. Square format, no text, abstract or symbolic icon, white background, scalable. ${baseStyle}`
    case 'logo_monochrome':
      return `Monochrome (single-color) version of the "${inputs.business_name}" logo. Pure black on white background. ${baseStyle}`
    case 'profile_picture':
      return `Square social media profile picture for "${inputs.business_name}". Logo lockup centered, generous padding around edges, optimized for circular crop, brand colors. ${baseStyle}`
    case 'banner_ig':
      return `Vertical Instagram story banner for "${inputs.business_name}". Hero composition, brand colors, ample empty space at top and bottom for text overlay. ${baseStyle}`
    case 'banner_fb':
      return `Wide horizontal Facebook cover image for "${inputs.business_name}". Cinematic composition, brand colors, focal point centered, text-friendly negative space. ${baseStyle}`
    case 'banner_yt':
      return `Wide YouTube channel banner for "${inputs.business_name}". 16:9 cinematic, brand colors, focal element centered (safe area for all screen sizes), professional. ${baseStyle}`
    case 'banner_x':
      return `Ultra-wide X (Twitter) header banner for "${inputs.business_name}". Horizontal panoramic composition, brand colors, focal point off-center to the right. ${baseStyle}`
    case 'banner_tiktok':
      return `Square TikTok profile picture for "${inputs.business_name}". Bold, simple, high-contrast, instantly readable at small sizes. ${baseStyle}`
    default:
      return baseStyle
  }
}
