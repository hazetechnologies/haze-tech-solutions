# Brand Kit — Instagram Highlight Covers + Discovery copy

**Date:** 2026-08-06
**Status:** Approved (build)

## Problem / Goal
Brand-kit generation should also produce, for every kit:
1. **A searchable keyword list** derived from the brand's `industry` + `business_description`.
2. **5 Instagram Highlight covers**, each a finished branded image whose baked-in
   title contains one of those keywords.
3. **An Instagram page NAME** (the display name, not the @username) that embeds a
   searchable term so the page ranks in IG search.

Also: covers currently look worse than ChatGPT because banners run through KIE
`gpt-image-2-image-to-image` at `resolution:'1K'`, get upscaled (soft), and are
scenery-only + deterministic overlay. Fix for covers = generate each as a WHOLE
`gpt-image-1` image (what ChatGPT does) — crisp, self-contained, no KIE, no overlay.

## Decisions (locked)
- **Covers are whole-image `gpt-image-1` generations** (NOT KIE, NOT overlay).
  Opaque background (`background:'opaque'`), 1024×1024, subject centered inside a
  safe circle so it reads at IG's tiny circular crop.
- **Keywords / IG name / cover titles are TEXT**, produced by the existing
  `gpt-4o-mini` structured call (new schema fields) + defensive backfill (mini isn't
  strict mode; must never render blank).
- Covers are **post-approval assets** — generated in the banner phase alongside
  banners + derived logos, and folded into the phase's completion/resume/self-invoke
  accounting so they're guaranteed and retried, not silently dropped.
- Covers do **not** need the approved logo as a reference (they bake their own icon).
- 5 covers is fixed for v1.

## Data model
`types.ts`
- `ImageAssetId` += `highlight_cover_1..5`.
- `BrandKitAssets` += `keywords?: string[]`, `instagram_page_name?: string`,
  `highlight_covers?: { title: string; keyword: string }[]`.

`sizes.ts` — `highlight_cover_1..5`: `{ generationSize:'1024x1024', finalWidth:1024, finalHeight:1024, fit:'fill' }`.
Add `HIGHLIGHT_COVER_IDS` (in index.ts) = the 5 ids.

## Prompts (`prompts.ts`)
- `STRUCTURED_SCHEMA` += `keywords` (array 8–12), `instagram_page_name` (string ≤60),
  `highlight_covers` (array of exactly 5 `{title, keyword}`; title 1–2 words).
  Add all three to `required`.
- System prompt gains guidance:
  - keywords: 8–12 lowercase search terms a customer would type, drawn from
    industry + what the business does; no `#`.
  - instagram_page_name: the display Name field (≤30 recommended), MUST contain a
    searchable category term (e.g. "Florvania | Florida Tours & Excursions").
  - highlight_covers: 5 covers; each `title` is 1–2 words a visitor taps
    (About, Tours, Reviews…) and MUST contain/echo one keyword; `keyword` is the
    matching search term.
- New `buildHighlightCoverPrompt({title,keyword}, inputs, palette, art)` — single flat
  centered icon representing `keyword` in the accent color on a primary/gradient
  background, the word `title` in clean brand type below, minimal, high-contrast,
  heavy padding for the circle crop, honor art direction. Forbids photographic
  clutter and extra text.

## Pipeline (`index.ts`)
- `generateImageWithRetry(prompt, size, kitId, assetId, background='transparent')` —
  new last param; covers pass `'opaque'` (logos keep `'transparent'`).
- `generateAllText` returns `keywords`, `instagram_page_name`, `highlight_covers`
  (with `normalizeStructuredExtras` backfill: keyword-ify industry/description words;
  IG name → `"{business} | {industry}"`; pad covers to 5 from a default set paired
  with keywords). Persisted with the rest of the text assets before the gate.
- `generateHighlightCovers(inputs, palette, clientId, kitId, existingImages, persist, artDirection, specs, errors)`
  — resume-safe (skips covers already on the row), fail-soft per cover (push to
  `errors`, never throw), `gpt-image-1` opaque whole-image, persists each. Derives
  `specs` from `assets.highlight_covers` else from inputs (so pre-existing kits get
  covers on re-fire).
- `POST_APPROVAL_REQUIRED_IDS = [...REFERENCE_ASSET_IDS, ...HIGHLIGHT_COVER_IDS]`
  drives allDone / madeProgress / missing / self-invoke in BOTH the `banners` and
  `all` completion blocks (covers counted the same as banners). Called before
  `generateBanners` in both paths.

## Front-end (`BrandKitView.jsx`)
- `IMAGE_LABELS` += `highlight_cover_1..5` (label falls back to the cover title from
  `a.highlight_covers[i]` when present, dims 1024×1024). They already auto-render in
  Visual identity + download via the generic proxy.
- New sections: **Instagram page name** (name + Copy) and **SEO keywords** (chips +
  copy-all). Both guarded so old kits without them render nothing.

## Testing
- `prompts.test.ts`: schema has the 3 new fields + they're required; a
  highlight-cover prompt contains the title, the keyword, and forbids extra text;
  `buildHighlightCoverPrompt` is deterministic.
- `deno test` green; `npm run build` green; `node --check` where relevant.

## Files
**Modified:** `supabase/functions/generate-brand-kit/{types.ts,sizes.ts,prompts.ts,index.ts,prompts.test.ts}`,
`src/pages/admin/components/BrandKitView.jsx`.
**No migration** (assets is JSON). Edge fn must be redeployed; web via Vercel.
