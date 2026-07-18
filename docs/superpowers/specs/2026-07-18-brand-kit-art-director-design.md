# Brand Kit AI Art-Director + Style Presets — Design

**Date:** 2026-07-18
**Status:** Approved

## Problem

Brand-kit logos and banners look generic compared to designing directly in
ChatGPT. The root cause is not resolution — it's that the image prompts are a
fixed, functional template (`buildImagePrompt` builds from vibe + palette +
inspirations only). There's no art direction: no considered composition,
typographic mood, mark style, or imagery language. ChatGPT gets a bespoke
creative brief from the user; the kit gets a generic one.

## Goal

Insert an **AI art-director step** that turns the brand profile (+ an optional
style preset) into a concrete, reusable art-direction brief, and inject that
brief into every image prompt (logos, derived marks, and banner scenery). Give
the admin/client an optional **Design style** preset picker (default Auto).

## Non-Goals

- Changing image models (logos stay `gpt-image-1`, banners stay KIE
  `gpt-image-2-image-to-image`) or the scenery+overlay banner architecture.
- Bumping resolution / upscaler quality (separate lever, not this spec).
- Per-asset regeneration UI / iteration loop (future).

## Decisions (locked)

- **Style selection:** a "Design style" dropdown on both intake forms, default
  **Auto (from brand vibe)**. Presets: `minimalist`, `editorial`, `luxury`,
  `gradient_3d`. Enum values: `auto | minimalist | editorial | luxury | gradient_3d`.
- **Art-director model:** Claude (`claude-opus-4-7`, same as the existing
  voice/pillars/palette calls), one extra call in `generateAllText`.
- **Scope:** logos, derived marks, and banners all consume the art direction.

---

## A. Style presets (edge `prompts.ts`)

```ts
export const STYLE_PRESETS: Record<string, string> = {
  auto: '',  // no forced style — the art-director infers from the brand
  minimalist: 'Minimalist and clean: generous negative space, a restrained 2-3 color use, simple geometric forms, thin-to-medium sans-serif type, no clutter or ornamentation. Think Apple / Stripe restraint.',
  editorial: 'Bold and editorial: large confident typography, strong contrast, deliberate color blocking, magazine-style asymmetric composition, striking focal points.',
  luxury: 'Premium and luxury: elegant and understated, refined type (a tasteful serif or a high-contrast sans), monochrome or metallic/gold accents, cinematic lighting, lots of breathing room, quietly expensive.',
  gradient_3d: 'Modern gradient / 3D: vibrant multi-stop gradients, glassy or subtly 3D elements, soft glow and depth, energetic and contemporary — the trendy premium-SaaS/tech look.',
}
```

The picked preset's paragraph (or, for `auto`, an "infer the style from the
brand" instruction) is fed to the art-director as a strong steer.

## B. `style_preset` input + intake UI

- Add `style_preset?: 'auto' | 'minimalist' | 'editorial' | 'luxury' | 'gradient_3d'`
  to `BrandKitInputs` (types.ts).
- New shared constant `src/lib/brandStylePresets.js`:
  ```js
  export const STYLE_PRESET_OPTIONS = [
    { value: 'auto',        label: 'Auto (from brand vibe)' },
    { value: 'minimalist',  label: 'Minimalist / clean' },
    { value: 'editorial',   label: 'Bold / editorial' },
    { value: 'luxury',      label: 'Premium / luxury' },
    { value: 'gradient_3d', label: 'Modern gradient / 3D' },
  ]
  ```
- A "Design style" `<select>` (default `auto`) is added to **both** intake forms
  (`src/pages/admin/components/BrandKitIntakeForm.jsx`,
  `src/pages/portal/PortalBrandKitIntakeForm.jsx`) and included in the `inputs`
  payload.
- Validate in `api/_lib/brand-kit-inputs.js`: if `style_preset` is present it must
  be one of the enum values (else 400). Absent = allowed (treated as `auto`).

## C. Art-director step (`index.ts`)

New `callArtDirector(inputs, palette, kitId, evtProps)` added to the
`Promise.all` in `generateAllText`. It calls `trackedClaude` (model
`claude-opus-4-7`) with a prompt that includes the brand profile
(business_name, industry, audience, vibe, inspirations, color_preference),
the resolved palette, and the chosen preset guidance (`STYLE_PRESETS[preset]`,
or an "infer from the brand" instruction when `auto`). It returns STRICT JSON:

```
{ "style_summary": string,       // 1-2 sentences: the overall visual language
  "logo_style": string,          // how the logo/marks should look (form + feel)
  "typography": string,          // type mood for the wordmark
  "banner_imagery_style": string,// the photographic/graphic backdrop style
  "composition": string }        // layout / negative-space / focal guidance
```

Parsed with a tolerant extractor (`parseArtDirection`) that pulls the JSON object
and returns the five string fields, each defaulting to `''` if absent (so a bad
response degrades to today's behavior rather than failing the kit). The result is
returned from `generateAllText` as `art_direction` and thus persisted in
`assets.art_direction` by the existing `update({ assets: { ...textAssets, ... } })`.

## D. Inject into image prompts

`buildImagePrompt(assetId, inputs, palette, art?)` gains a 4th arg — the
`art_direction` object (or null). When present:

- **Logo options (`logo_option_1/2/3`) + derived (`logo_icon`, `logo_monochrome`):**
  append ` Overall style: ${art.style_summary} Logo direction: ${art.logo_style} Typography: ${art.typography}` to the prompt.
- **Banner scenery + profile picture:** append ` Art direction: ${art.banner_imagery_style} Composition: ${art.composition}` (kept compatible with the existing `sceneryOnly` "no text/logos/panels" guard).
- Absent/empty art → prompt is exactly as today (no regression).

**Threading:**
- `generateLogos(...)` and `generateBanners(...)` and `ensureDerivedLogos(...)`
  each gain an `artDirection` param, forwarded to `buildImagePrompt`.
- Phases `all` / `logos_then_pause`: use `textAssets.art_direction`.
- Phase `banners`: read `existingAssets.art_direction` and pass it to
  `ensureDerivedLogos` + `generateBanners`.
- Phase `logos_only`: read `existingAssets.art_direction` and pass to
  `generateLogos`.

## E. Display (admin BrandKitView)

Add a small "Design direction" block above the visual identity grid showing the
chosen style (from `inputs.style_preset`, default "Auto") and the
`art_direction.style_summary` when present. Read-only.

## Data flow

```
intake form (style_preset) → inputs
  → edge generateAllText → callArtDirector(brand + preset) → art_direction (jsonb, stored)
  → buildImagePrompt(assetId, inputs, palette, art_direction) for logos + banners
  → gpt-image-1 (logos) / KIE (banners) render with the bespoke brief
banners-only / logos-only re-fires read art_direction back off the row
```

## Error handling

- Art-director call fails / unparseable → `art_direction` = all-empty object →
  prompts fall back to today's behavior. Never fails the kit.
- Unknown `style_preset` → 400 from the validator (client-side dropdown can't
  produce one, but the server guards anyway).

## Testing

- **Deno unit** (`prompts.ts` helpers, co-located):
  - `resolveStylePreset(preset)` → returns the guidance string (`auto`/unknown → the "infer" instruction).
  - `parseArtDirection(text)` → clean JSON, fenced JSON, prose-wrapped JSON, and garbage (→ all-empty object, never throws).
  - `buildImagePrompt` appends logo direction for a logo asset and imagery direction for a banner asset when `art` is supplied, and is unchanged when it's null.
- **Build/deno-check** + manual: pick each preset on an intake → generated kit's
  `art_direction` reflects the style and logos/banners visibly follow it; `auto`
  still produces a sensible brief.

## Files

**New**
- `src/lib/brandStylePresets.js` (`STYLE_PRESET_OPTIONS`)

**Modified**
- `supabase/functions/generate-brand-kit/prompts.ts` — `STYLE_PRESETS`,
  `resolveStylePreset`, `parseArtDirection`, `buildArtDirectorPrompt`,
  `buildImagePrompt` 4th arg
- `supabase/functions/generate-brand-kit/index.ts` — `callArtDirector`, thread
  `art_direction` through `generateAllText` / `generateLogos` /
  `ensureDerivedLogos` / `generateBanners` and all phases
- `supabase/functions/generate-brand-kit/types.ts` — `style_preset` on
  `BrandKitInputs`; `art_direction` on `BrandKitAssets`
- `api/_lib/brand-kit-inputs.js` — validate optional `style_preset` enum
- `src/pages/admin/components/BrandKitIntakeForm.jsx`,
  `src/pages/portal/PortalBrandKitIntakeForm.jsx` — Design-style dropdown
- `src/pages/admin/components/BrandKitView.jsx` — show chosen style + summary

**Deploy:** edge function redeploy; Vercel auto-deploys web+api. No migration
(art_direction lives inside the existing `assets` jsonb; `style_preset` inside
`inputs` jsonb).
