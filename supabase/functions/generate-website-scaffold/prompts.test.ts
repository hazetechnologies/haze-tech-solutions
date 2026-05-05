// supabase/functions/generate-website-scaffold/prompts.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildSystemPrompt, buildUserPrompt, AI_CONTENT_SCHEMA } from './prompts.ts'

Deno.test('buildSystemPrompt without brand kit', () => {
  const out = buildSystemPrompt(null)
  assertStringIncludes(out, 'senior website copywriter')
  assertStringIncludes(out, 'JSON')
})

Deno.test('buildSystemPrompt with brand kit injects voice tone', () => {
  const out = buildSystemPrompt({
    business_name: 'Acme Co',
    palette: [],
    voice_tone: '## Voice\n- Confident\n- Direct',
  })
  assertStringIncludes(out, 'Acme Co')
  assertStringIncludes(out, 'Confident')
})

Deno.test('buildUserPrompt includes all inputs', () => {
  const out = buildUserPrompt({
    template_id: 'service-business',
    domain: 'example.com',
    business_description: 'A landscaping company',
    services: ['Lawn care', 'Tree trimming'],
    pages: ['Home', 'About'],
    color_style_prefs: 'green and earthy',
    use_brand_kit: false,
  }, 'Green Thumb Co')
  assertStringIncludes(out, 'Green Thumb Co')
  assertStringIncludes(out, 'example.com')
  assertStringIncludes(out, 'Lawn care, Tree trimming')
  assertStringIncludes(out, 'service-business')
})

Deno.test('AI_CONTENT_SCHEMA has all required top-level fields', () => {
  assertEquals(AI_CONTENT_SCHEMA.required, ['hero','about','services','contact_cta','meta','footer_tagline'])
})
