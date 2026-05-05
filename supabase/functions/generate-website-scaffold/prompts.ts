// supabase/functions/generate-website-scaffold/prompts.ts
import type { WebsiteProjectInputs, BrandKitContext } from './types.ts'

export const AI_CONTENT_SCHEMA = {
  type: 'object',
  required: ['hero','about','services','contact_cta','meta','footer_tagline'],
  properties: {
    hero: {
      type: 'object',
      required: ['headline','subheadline','cta'],
      properties: {
        headline:    { type: 'string', maxLength: 80 },
        subheadline: { type: 'string', maxLength: 200 },
        cta:         { type: 'string', maxLength: 30 },
      },
    },
    about: {
      type: 'object',
      required: ['heading','body'],
      properties: {
        heading: { type: 'string', maxLength: 60 },
        body:    { type: 'string', maxLength: 600 },
      },
    },
    services: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name','description'],
        properties: {
          name:        { type: 'string', maxLength: 50 },
          description: { type: 'string', maxLength: 200 },
        },
      },
    },
    contact_cta: {
      type: 'object',
      required: ['heading','body'],
      properties: {
        heading: { type: 'string', maxLength: 60 },
        body:    { type: 'string', maxLength: 200 },
      },
    },
    meta: {
      type: 'object',
      required: ['title','description'],
      properties: {
        title:       { type: 'string', maxLength: 60 },
        description: { type: 'string', maxLength: 160 },
      },
    },
    footer_tagline: { type: 'string', maxLength: 80 },
  },
}

export function buildSystemPrompt(brandKit: BrandKitContext | null): string {
  const lines = [
    'You are a senior website copywriter. Output ONLY valid JSON matching the schema. No markdown, no preamble.',
    'Tone: confident, benefit-led, scannable. Headlines under 80 chars. Avoid filler ("we are committed to..."), industry jargon, and hyperbole.',
    'CTAs: action verbs ("Get Started", "Book a Call", "See Pricing"). Never use "Click Here" or "Learn More".',
  ]
  if (brandKit) {
    lines.push(`Brand voice context for ${brandKit.business_name}:`)
    lines.push(brandKit.voice_tone)
    lines.push(`Honor this brand voice in every section.`)
  }
  return lines.join('\n\n')
}

export function buildUserPrompt(inputs: WebsiteProjectInputs, businessName: string): string {
  return [
    `Generate website copy for ${businessName}.`,
    '',
    'Inputs:',
    `- Domain: ${inputs.domain}`,
    `- Business description: ${inputs.business_description}`,
    `- Services to highlight: ${inputs.services.join(', ')}`,
    `- Pages: ${inputs.pages.join(', ')}`,
    `- Color & style preferences: ${inputs.color_style_prefs}`,
    `- Template: ${inputs.template_id}`,
    '',
    'Output EXACTLY this JSON structure with no additional keys, no nesting under "pages" or "site":',
    '{',
    '  "hero":        { "headline": "<6-9 words, punchy, benefit-led>", "subheadline": "<1 sentence>", "cta": "<2-3 word action verb>" },',
    '  "about":       { "heading": "<short heading>", "body": "<3-4 sentence about section about what makes this business different>" },',
    '  "services":    [{ "name": "<service name>", "description": "<1-2 sentence description>" }],',
    '  "contact_cta": { "heading": "<short heading>", "body": "<1-2 sentence body that nudges visitors to reach out>" },',
    '  "meta":        { "title": "<SEO title ≤60 chars, includes business name>", "description": "<SEO meta description 140-160 chars, includes a CTA>" },',
    '  "footer_tagline": "<4-8 words capturing the brand essence>"',
    '}',
    '',
    'Rules:',
    `- "services" array MUST have exactly ${inputs.services.length} entries, one per input service, in the same order. Do NOT add extras.`,
    '- All keys MUST appear at the top level. Do NOT wrap them in "pages", "site", or any other container.',
    '- Output ONLY the JSON object — no markdown fences, no preamble, no commentary.',
  ].join('\n')
}
