# `template-scroll-motion` Website Template — Design

**Date:** 2026-07-18
**Status:** Approved (pilot)

## Problem

The website builder's `template-*` repos are content-only **stubs** (a `content.json`
+ README, no site code); the dev team hand-builds each site. So clients can't get
a "3D / scrollable / motion / video-background" site — no such rendered template
exists. This is the PILOT for turning a stub into a real, deployable template with
premium scroll + motion effects.

## Goal

Build `template-scroll-motion`: a real Vite + React site with GSAP scroll/motion
effects that renders a client's `content.json`, deployable on Vercel, published as
a GitHub **template repository**, and offered in the website intake picker. It
becomes the model for real templates.

## Contract: `content.json` (must match the scaffold generator's `AiContent`)

```json
{
  "hero":        { "headline": "", "subheadline": "", "cta": "" },
  "about":       { "heading": "", "body": "" },
  "services":    [ { "name": "", "description": "" } ],
  "contact_cta": { "heading": "", "body": "" },
  "meta":        { "title": "", "description": "" },
  "footer_tagline": ""
}
```
The template ships with this EMPTY stub (so a raw clone renders graceful
placeholders). The scaffold overwrites `content.json` with the client's copy;
the site reads it at build time (`import content from './content.json'`) and
renders it. Every field is optional at render time — missing/empty → sensible
fallback text or a hidden section (never a crash, never an empty broken layout).

## Stack

- **Vite + React 18** (matches the main app's ecosystem), plain CSS (no Tailwind —
  keep the template self-contained), **GSAP + ScrollTrigger** for effects.
- Static build (`vite build` → `dist/`), Vercel-deployable (SPA, single page).
- Dark, premium aesthetic; a small built-in accent/theme (neutral so it fits any
  brand — the scaffold doesn't yet inject palette into this template).

## Sections (single long-scroll page)

1. **Hero** — `hero.headline` animated **char-by-char fade-up** on load;
   `subheadline` fades in; `cta` button (smooth-scrolls to Contact). Subtle
   animated gradient / parallax backdrop.
2. **About** — `about.heading` + `about.body`, revealed on scroll (fade + rise,
   ScrollTrigger scrub).
3. **Services** — grid of `services[]` cards (name + description), **staggered
   scroll-reveal** + **mouse-tilt 3D hover**. If `services` is empty, hide the
   section.
4. **Contact CTA** — `contact_cta.heading` + `body` + a button, on a contrasting
   full-bleed panel that scales/parallaxes in.
5. **Footer** — `footer_tagline` + a small "Built by Haze Tech" line.

`meta.title` → `<title>`; `meta.description` → `<meta name="description">` (set in
`index.html` as defaults + overridden from content at runtime).

## Effects (from the scroll-3d recipes)

- Char-fade hero headline (split into spans, GSAP stagger).
- ScrollTrigger scrub reveals (fade + translateY) per section.
- Parallax backdrop layer(s) on scroll.
- Mouse-tilt 3D on service cards (rotateX/Y from pointer position, reset on leave).
- Respect `prefers-reduced-motion` — skip/short-circuit animations when set.
- No layout shift / no horizontal scroll; mobile-responsive (effects degrade
  gracefully on touch).

## Delivery

1. Build the site in `C:\repos\template-scroll-motion` (Vite project), with the
   empty stub `content.json`, `README.md`, and a Vercel-friendly build.
2. Create GitHub repo `hazetechnologies/template-scroll-motion`, push `main`, and
   set it as a **template repository** (`gh api ... -f is_template=true`) so the
   scaffold's create-from-template API works.
3. Wire `{ id: 'scroll-motion', name: 'Scroll & Motion', blurb: '…' }` into the
   `TEMPLATES` list in `src/pages/portal/PortalWebsiteIntake.jsx` (and the admin
   equivalent if one exists) in haze-tech — a small PR. The scaffold already maps
   `templateId → template-${templateId}`, so `scroll-motion` resolves to the new
   repo with no edge-function change.

## Testing

- `npm run build` in the template builds clean; `npm run dev` renders the stub
  with graceful placeholders and all effects run.
- Drop a filled `content.json` (sample client copy) → all sections render
  correctly, empty `services` hides the section, reduced-motion disables anims.
- haze-tech `npm run build` green after the picker edit.
- Manual: intake shows "Scroll & Motion"; selecting it + submitting creates a repo
  from `template-scroll-motion` (verified once creds/flow available).

## Out of scope (pilot)

- Injecting the brand-kit palette/logo into the template (future — the scaffold
  would pass palette; the template would theme from it).
- The other three styles (3D, video-background) — separate templates once this
  pattern is proven.
- Auto-deploying the generated client repo to Vercel (existing builder concern).
