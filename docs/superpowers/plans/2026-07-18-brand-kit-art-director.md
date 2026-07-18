# Brand Kit AI Art-Director + Style Presets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed a bespoke, AI-generated art-direction brief (steered by an optional style preset) into every brand-kit image prompt so logos and banners look designed, not templated.

**Architecture:** A new Claude "art-director" call in the edge function turns the brand profile + chosen preset into a structured brief (`art_direction`), stored in `assets.art_direction` and injected into `buildImagePrompt` for logos and banner scenery. A "Design style" dropdown (default Auto) on both intake forms drives it. Image models are unchanged.

**Tech Stack:** Supabase Deno edge function (`generate-brand-kit`), `trackedClaude` (`claude-opus-4-7`), React (Vite) admin/portal, Vercel Node validator, Deno test runner.

## Global Constraints

- Enum values (verbatim): `auto | minimalist | editorial | luxury | gradient_3d`. Absent = `auto`.
- Art-director model: `claude-opus-4-7` (const `OPUS_MODEL`, `ANTHROPIC_KEY` in index.ts).
- Never fail the kit on art-director errors — degrade to empty art direction (today's behavior).
- No migration: `style_preset` lives in `inputs` jsonb, `art_direction` in `assets` jsonb.
- Run Deno tests: `export PATH="$HOME/.deno/bin:$PATH" && deno test --allow-net <file>`.

---

## Task 1: prompts.ts — presets, art-director prompt, parser, prompt injection

**Files:**
- Modify: `supabase/functions/generate-brand-kit/prompts.ts`
- Create: `supabase/functions/generate-brand-kit/prompts.test.ts`

**Interfaces:**
- Produces: `STYLE_PRESETS: Record<string,string>`; `resolveStylePreset(preset?: string): string`; `ArtDirection` interface + `EMPTY_ART_DIRECTION`; `parseArtDirection(text: string): ArtDirection`; `buildArtDirectorPrompt(inputs, palette): { system, user }`; `buildImagePrompt(assetId, inputs, palette, art?: ArtDirection | null): string` (new 4th arg).

- [ ] **Step 1: Write the failing test** — `supabase/functions/generate-brand-kit/prompts.test.ts`

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveStylePreset, parseArtDirection, buildImagePrompt, EMPTY_ART_DIRECTION } from './prompts.ts'

const inputs = {
  path: 'cold_start', business_name: 'Acme', industry: 'Coffee', audience: 'Locals',
  vibe: ['warm'], inspirations: 'Blue Bottle',
} as any
const palette = [{ name: 'primary', hex: '#112233', use: '' }] as any

Deno.test('resolveStylePreset returns preset guidance for a known preset', () => {
  assertEquals(resolveStylePreset('luxury').includes('luxury'), true)
})
Deno.test('resolveStylePreset infers for auto/unknown', () => {
  assertEquals(resolveStylePreset('auto').toLowerCase().includes('infer'), true)
  assertEquals(resolveStylePreset(undefined).toLowerCase().includes('infer'), true)
  assertEquals(resolveStylePreset('bogus').toLowerCase().includes('infer'), true)
})
Deno.test('parseArtDirection reads clean JSON', () => {
  const a = parseArtDirection('{"style_summary":"s","logo_style":"l","typography":"t","banner_imagery_style":"b","composition":"c"}')
  assertEquals(a, { style_summary: 's', logo_style: 'l', typography: 't', banner_imagery_style: 'b', composition: 'c' })
})
Deno.test('parseArtDirection tolerates fences/prose and fills missing with empty', () => {
  const a = parseArtDirection('here:\n```json\n{"logo_style":"l"}\n```')
  assertEquals(a.logo_style, 'l')
  assertEquals(a.style_summary, '')
})
Deno.test('parseArtDirection returns all-empty on garbage (never throws)', () => {
  assertEquals(parseArtDirection('no json'), EMPTY_ART_DIRECTION)
  assertEquals(parseArtDirection(''), EMPTY_ART_DIRECTION)
})
Deno.test('buildImagePrompt injects logo direction for a logo asset', () => {
  const art = { ...EMPTY_ART_DIRECTION, logo_style: 'ZLOGOZ', typography: 'ZTYPEZ' }
  const p = buildImagePrompt('logo_option_1', inputs, palette, art)
  assertEquals(p.includes('ZLOGOZ'), true)
  assertEquals(p.includes('ZTYPEZ'), true)
})
Deno.test('buildImagePrompt injects imagery direction for a banner asset', () => {
  const art = { ...EMPTY_ART_DIRECTION, banner_imagery_style: 'ZIMGZ', composition: 'ZCOMPZ' }
  const p = buildImagePrompt('banner_yt', inputs, palette, art)
  assertEquals(p.includes('ZIMGZ'), true)
})
Deno.test('buildImagePrompt is unchanged when art is null', () => {
  const withNull = buildImagePrompt('logo_option_1', inputs, palette, null)
  const without = buildImagePrompt('logo_option_1', inputs, palette)
  assertEquals(withNull, without)
})
```

- [ ] **Step 2: Run it, confirm FAIL** — `deno test --allow-net supabase/functions/generate-brand-kit/prompts.test.ts` (missing exports).

- [ ] **Step 3: Add the presets, types, resolver, parser, and art-director prompt** at the TOP of `prompts.ts` (after the imports, before the existing `STRUCTURED_SCHEMA`):

```ts
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
```

(`BrandKitInputs` and `ColorPaletteEntry` are already imported at the top of prompts.ts — confirm; if not, add them to the existing `import type { … } from './types.ts'`.)

- [ ] **Step 4: Add the 4th arg + injection to `buildImagePrompt`.** Change the signature:

```ts
export function buildImagePrompt(
  assetId: string,
  inputs: BrandKitInputs,
  palette: ColorPaletteEntry[],
  art?: ArtDirection | null,
): string {
```

Immediately after the existing `sceneryOnly` const is defined (inside the function, before the `switch`), add:

```ts
  const hasLogoArt = !!art && !!(art.style_summary || art.logo_style || art.typography)
  const logoArt = hasLogoArt
    ? ` Style direction — overall: ${art!.style_summary}; logo form: ${art!.logo_style}; typography: ${art!.typography}.`
    : ''
  const hasBannerArt = !!art && !!(art.banner_imagery_style || art.composition)
  const bannerArt = hasBannerArt
    ? ` Style direction — imagery: ${art!.banner_imagery_style}; composition: ${art!.composition}.`
    : ''
```

Append `bannerArt` to the shared scenery suffix so every scene asset (profile + all banners) inherits it — change the `sceneryOnly` const's final line to end with `${bannerArt}` appended after the closing text (i.e. `… high-resolution photography.${bannerArt}\`` inside that template literal).

Append `${logoArt}` at the very end of the returned string (before the closing backtick, after the trailing `${baseStyle}`) in EACH of these six logo cases: `logo_option_1`, `logo_option_2`, `logo_option_3`, `logo_primary`, `logo_icon`, `logo_monochrome`. Example for `logo_icon`:

```ts
    case 'logo_icon':
      return `Icon-only version of the "${inputs.business_name}" brand mark. Square format, no text, abstract or symbolic icon, on a fully transparent background (no background fill), scalable. ${baseStyle}${logoArt}`
```

Do the same (`…${baseStyle}${logoArt}\``) for the other five logo cases. Do NOT add `logoArt` to any scene/banner case.

- [ ] **Step 5: Run tests, confirm PASS** — `deno test --allow-net supabase/functions/generate-brand-kit/prompts.test.ts` (8 tests) and `deno check supabase/functions/generate-brand-kit/prompts.ts`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/generate-brand-kit/prompts.ts supabase/functions/generate-brand-kit/prompts.test.ts
git commit -m "feat(brand-kit): style presets, art-director prompt/parser, prompt injection"
```

---

## Task 2: types + index.ts — art-director call and threading

**Files:**
- Modify: `supabase/functions/generate-brand-kit/types.ts`
- Modify: `supabase/functions/generate-brand-kit/index.ts`

**Interfaces:**
- Consumes: `buildArtDirectorPrompt`, `parseArtDirection`, `ArtDirection`, `EMPTY_ART_DIRECTION` (Task 1).
- Produces: `art_direction` on the kit's `assets`; every `buildImagePrompt` call receives the art direction.

- [ ] **Step 1: types.ts — add the fields.** In `BrandKitInputs`, add:

```ts
  // Optional visual style preset chosen at intake; drives the art-director step.
  style_preset?: 'auto' | 'minimalist' | 'editorial' | 'luxury' | 'gradient_3d'
```

In `BrandKitAssets`, add (near `voice_tone`):

```ts
  art_direction?: {
    style_summary: string
    logo_style: string
    typography: string
    banner_imagery_style: string
    composition: string
  }
```

- [ ] **Step 2: index.ts — import the new helpers.** Add to the existing `import { … } from './prompts.ts'` block: `buildArtDirectorPrompt`, `parseArtDirection`. Add to the `import type { … } from './types.ts'` block: `ArtDirection` — wait, `ArtDirection` is exported from prompts.ts, so import it from there: add `ArtDirection`, `EMPTY_ART_DIRECTION` to the `./prompts.ts` import.

- [ ] **Step 3: index.ts — add `callArtDirector`.** Place it next to `callOpusPillars` (mirror its shape):

```ts
async function callArtDirector(
  inputs: BrandKitInputs,
  palette: ColorPaletteEntry[],
  kitId: string,
  evtProps: Record<string, unknown>,
): Promise<ArtDirection> {
  const { system, user } = buildArtDirectorPrompt(inputs, palette)
  const { data, status } = await trackedClaude({
    apiKey: ANTHROPIC_KEY,
    model: OPUS_MODEL,
    system,
    messages: [{ role: 'user', content: user }],
    params: { max_tokens: 1200 },
    distinctId: kitId,
    eventProperties: evtProps,
  })
  // Fail SOFT: art direction is an enhancement — never fail the kit for it.
  if (status !== 200) {
    console.error('art-director call failed:', status, JSON.stringify(data).slice(0, 200))
    return { ...EMPTY_ART_DIRECTION }
  }
  return parseArtDirection(extractText(data))
}
```

- [ ] **Step 4: index.ts — run it in `generateAllText` and return it.** In `generateAllText`, the palette is computed by `callOpusPalette`. The art-director needs the palette, so run it AFTER the palette resolves (don't add it to the initial `Promise.all` that produces the palette). Change `generateAllText` so that after `palette` is available:

```ts
  const art_direction = await callArtDirector(inputs, palette, kit_id, evtProps)
```

and add `art_direction` to the returned object:

```ts
  return {
    bios: normalizeBios(structured.bios),
    hashtags: structured.hashtags,
    handles: inputs.path === 'cold_start' ? structured.handles : undefined,
    platform_priority: inputs.path === 'cold_start' ? structured.platform_priority : undefined,
    voice_tone: voiceTone,
    content_pillars: pillarsResp,
    color_palette: palette,
    art_direction,
    tagline,
    cta,
  }
```

(Read the current `generateAllText` body: `palette` comes from the `Promise.all`; add the `callArtDirector` await on the line after that array is destructured, before the `return`.)

- [ ] **Step 5: index.ts — thread art into the image generators.** Add an `artDirection: ArtDirection | null` parameter to three functions and forward it to `buildImagePrompt`:
  - `generateLogos(... , assetIds, artDirection)` → at its `buildImagePrompt(assetId, inputs, palette)` call, change to `buildImagePrompt(assetId, inputs, palette, artDirection)`.
  - `generateBanners(... , bannerErrors, artDirection)` → at its `buildImagePrompt(assetId, inputs, palette)` call, change to `buildImagePrompt(assetId, inputs, palette, artDirection)`.
  - `ensureDerivedLogos(... , persist, artDirection)` → forward it into its internal `generateLogos(... , missing, artDirection)` call.

- [ ] **Step 6: index.ts — pass art at every call site + phase.**
  - Phase `all` / `logos_then_pause`: `generateLogos(inputs, textAssets.color_palette, client_id, kit_id, existing_logos, LOGO_OPTION_IDS, textAssets.art_direction ?? null)`; and in the same block `ensureDerivedLogos(..., persistAll, textAssets.art_direction ?? null)` and `generateBanners(..., bannerErrors, textAssets.art_direction ?? null)`.
  - Phase `banners`: read `const artDirection = (existingAssets.art_direction ?? null) as ArtDirection | null` and pass it to `ensureDerivedLogos(..., persist, artDirection)` and `generateBanners(..., bannerErrors, artDirection)`.
  - Phase `logos_only`: pass `existingAssets.art_direction ?? null` as the new `generateLogos(..., LOGO_OPTION_IDS, existingAssets.art_direction ?? null)` arg.

- [ ] **Step 7: Type-check** — `deno check supabase/functions/generate-brand-kit/index.ts` → clean.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/generate-brand-kit/index.ts supabase/functions/generate-brand-kit/types.ts
git commit -m "feat(brand-kit): art-director call + thread art direction through image prompts"
```

---

## Task 3: validate `style_preset` in the shared validator

**Files:**
- Modify: `api/_lib/brand-kit-inputs.js`
- Modify: `api/_lib/brand-kit-inputs.test.js`

**Interfaces:**
- Consumes: existing `validateBrandKitInputs(inputs) → { ok, error }`.

- [ ] **Step 1: Add failing tests** to `api/_lib/brand-kit-inputs.test.js`:

```js
Deno.test('accepts a valid style_preset', () => {
  assertEquals(validateBrandKitInputs({ ...base, style_preset: 'luxury' }).ok, true)
})
Deno.test('accepts absent style_preset', () => {
  assertEquals(validateBrandKitInputs(base).ok, true)
})
Deno.test('rejects an invalid style_preset', () => {
  const r = validateBrandKitInputs({ ...base, style_preset: 'neon' })
  assertEquals(r.ok, false)
  assertEquals(r.error.includes('style_preset'), true)
})
```

- [ ] **Step 2: Run, confirm the new ones FAIL** — `export PATH="$HOME/.deno/bin:$PATH" && deno test --allow-net api/_lib/brand-kit-inputs.test.js`.

- [ ] **Step 3: Add the validation** to `validateBrandKitInputs` in `api/_lib/brand-kit-inputs.js`, just before the final `return { ok: true }`:

```js
  if (inputs.style_preset !== undefined) {
    const allowed = ['auto', 'minimalist', 'editorial', 'luxury', 'gradient_3d']
    if (!allowed.includes(inputs.style_preset)) {
      return { ok: false, error: `style_preset must be one of ${allowed.join(', ')}` }
    }
  }
```

- [ ] **Step 4: Run tests, confirm ALL PASS.**

- [ ] **Step 5: Commit**

```bash
git add api/_lib/brand-kit-inputs.js api/_lib/brand-kit-inputs.test.js
git commit -m "feat(brand-kit): validate optional style_preset"
```

---

## Task 4: Design-style dropdown on both intake forms

**Files:**
- Create: `src/lib/brandStylePresets.js`
- Modify: `src/pages/admin/components/BrandKitIntakeForm.jsx`
- Modify: `src/pages/portal/PortalBrandKitIntakeForm.jsx`

- [ ] **Step 1: Create the shared constant** — `src/lib/brandStylePresets.js`:

```js
// src/lib/brandStylePresets.js
export const STYLE_PRESET_OPTIONS = [
  { value: 'auto',        label: 'Auto (from brand vibe)' },
  { value: 'minimalist',  label: 'Minimalist / clean' },
  { value: 'editorial',   label: 'Bold / editorial' },
  { value: 'luxury',      label: 'Premium / luxury' },
  { value: 'gradient_3d', label: 'Modern gradient / 3D' },
]
```

- [ ] **Step 2: Admin form** — `src/pages/admin/components/BrandKitIntakeForm.jsx`:
  - Import: `import { STYLE_PRESET_OPTIONS } from '../../../lib/brandStylePresets'`.
  - Add `style_preset: 'auto'` to the initial form state objects (both the regenerate branch and the fresh/default branch of the `initial` useMemo).
  - Include it in the submitted `inputs`: add `style_preset: form.style_preset || 'auto',` to the `inputs` object built in `handleSubmit`.
  - Add a field (place it right after the "Brand vibe" field block):

```jsx
      <Field label="Design style">
        <select value={form.style_preset || 'auto'} onChange={e => setField('style_preset', e.target.value)} style={inputStyle}>
          {STYLE_PRESET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
```

- [ ] **Step 3: Client form** — `src/pages/portal/PortalBrandKitIntakeForm.jsx`:
  - Import: `import { STYLE_PRESET_OPTIONS } from '../../lib/brandStylePresets'`.
  - Add `style_preset: 'auto'` to the `useState` form initializer.
  - Include `style_preset: form.style_preset || 'auto'` in the `inputs` object sent in `handleSubmit`.
  - Add the same `<Field label="Design style">` select (using this file's `Field`, `inputStyle` styles) right after the "Brand vibe" field.

- [ ] **Step 4: Build** — `npm run build` (succeeds).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brandStylePresets.js src/pages/admin/components/BrandKitIntakeForm.jsx src/pages/portal/PortalBrandKitIntakeForm.jsx
git commit -m "feat(brand-kit): Design style dropdown on admin + client intake"
```

---

## Task 5: Show the chosen style + summary in the admin kit view

**Files:**
- Modify: `src/pages/admin/components/BrandKitView.jsx`

- [ ] **Step 1: Render a "Design direction" line.** The component receives the kit; its inputs are on the row (read `kit.inputs?.style_preset`) and the brief on `kit.assets?.art_direction`. Just above the "Visual identity" `<Section>`, add:

```jsx
      {(kit?.inputs?.style_preset || kit?.assets?.art_direction?.style_summary) && (
        <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#00D4FF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Design style: {kit?.inputs?.style_preset || 'auto'}
          </div>
          {kit?.assets?.art_direction?.style_summary && (
            <div style={{ fontSize: 12, color: '#CBD5E1', lineHeight: 1.5 }}>{kit.assets.art_direction.style_summary}</div>
          )}
        </div>
      )}
```

(Read `BrandKitView.jsx` first to confirm the prop name for the kit object and the `a`/`kit` variable in scope; adapt `kit`/`a` to the actual local names — `a` is already used for `a.images`, so `kit.inputs`/`a.art_direction` may map to the real variables. Use whatever the file already destructures for assets.)

- [ ] **Step 2: Build** — `npm run build` (succeeds).

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/components/BrandKitView.jsx
git commit -m "feat(brand-kit): show design style + art-direction summary in admin view"
```

---

## Task 6: Deploy + QA

**Files:** none.

- [ ] **Step 1: Full verification**

```bash
export PATH="$HOME/.deno/bin:$PATH"
deno test --allow-net supabase/functions/generate-brand-kit/prompts.test.ts api/_lib/brand-kit-inputs.test.js
deno check supabase/functions/generate-brand-kit/index.ts
npm run build
```
Expected: all tests pass, check clean, build green.

- [ ] **Step 2: Deploy the edge function** (after the branch is merged in the finishing step):

```bash
# OneDrive haze-tech dir with .env sourced; SUPABASE_ACCESS_TOKEN=$SUPABASE_MGMT_API_TOKEN
cd /c/repos/haze-tech-solutions
npx --yes supabase@latest functions deploy generate-brand-kit --project-ref ioxpfvxcsclgmwyslxjj --use-api
```

- [ ] **Step 3: Manual QA**
  - Admin → a client → Start Brand Kit → pick **Premium / luxury** → after generation, the kit's `assets.art_direction` reflects a luxury brief and the admin view shows "Design style: luxury" + summary; logos/banners visibly lean luxury.
  - Repeat with **Auto** → still produces a sensible brief.
  - Client portal intake shows the Design style dropdown and submits it.
  - (Banners still need KIE credits to render — the art direction shows in `art_direction` regardless.)

---

## Self-Review Notes

- **Spec coverage:** A→T1 (STYLE_PRESETS/resolve); B→T2 (types), T3 (validator), T4 (constant+forms); C→T1 (art-director prompt/parse), T2 (callArtDirector + store); D→T1 (buildImagePrompt injection) + T2 (threading); E→T5 (display); testing→T1/T3/T6. All mapped.
- **Names consistent:** `resolveStylePreset`, `parseArtDirection`, `ArtDirection`, `EMPTY_ART_DIRECTION`, `buildArtDirectorPrompt`, `callArtDirector`, `art_direction`, enum `auto|minimalist|editorial|luxury|gradient_3d`, `STYLE_PRESET_OPTIONS` — used identically across tasks.
- **No migration** — `style_preset` in inputs jsonb, `art_direction` in assets jsonb.
