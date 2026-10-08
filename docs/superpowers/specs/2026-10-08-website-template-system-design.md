# Website template system: per-template content contracts + a Next.js concept line

**Date:** 2026-10-08
**Status:** design — lineup pending approval
**Supersedes nothing.** Extends the funnel shipped in #7 and the registry in #117.

## Why now

The ask is "more design concepts to add." Reading the funnel first turned up
why adding one is currently harder than it should be, and one live defect that
has now shipped as #117.

### What exists

```
admin activates website_projects row (intake_pending)
  → client fills /portal/website-intake
  → POST /api/website?action=intake            (validates template_id)
  → edge fn generate-website-scaffold
      ├─ Claude Sonnet → AiContent JSON
      ├─ GitHub create-from-template  template-<id> → <slug>-website
      └─ commit content.json
  → status done, repo_url stored
```

Six template repos exist in `hazetechnologies`, all real GitHub templates.
`template-scroll-motion/content.json` matches the `AiContent` contract, so the
plumbing is sound.

### What is in the way

1. **One content shape for every template.** `AiContent` is six fields:
   `hero`, `about`, `services`, `contact_cta`, `meta`, `footer_tagline`. A
   roofer and a SaaS land on the same skeleton. Any concept needing
   testimonials, stats, FAQ, pricing or a gallery has nowhere to put them, so
   "more design concepts" currently means "more skins of one page."

2. **`pages` is collected and discarded.** The intake offers Blog, Portfolio,
   FAQ and Pricing and passes them into the prompt, but nothing in `AiContent`
   or any template renders a second page. The form sells what the build cannot
   deliver. Out of scope here; recorded so it is not mistaken for new breakage.

3. **Nothing is ever seen.** Templates are picked from a text blurb — no
   thumbnail. The only output is a private GitHub repo URL. There is no deploy
   step anywhere in the funnel, so neither operator nor client ever looks at
   the generated site. Out of scope here, but it is what makes a bigger
   catalogue risky: ten templates chosen blind is worse than six.

4. **(Fixed in #117.)** The template id was hardcoded in four places. PR #98
   added `scroll-motion` to the picker alone, so the flagship template returned
   `400 Invalid template_id` from 2026-07-19 until today.

## Decision 1 — new concepts are built on Next.js App Router

The nineteen `design-*` component skills are all written for Next.js App
Router. The existing six templates are Vite + React 18 + GSAP.

**New templates target Next.js; the existing six stay on Vite.** Reasons, in
order of weight:

- **SEO.** A Vite template ships a client-rendered page with one static head.
  This session spent a full cycle proving on hazetechsolutions.com that this
  is worth roughly nothing to search engines, and had to bolt on build-time
  shells to fix it. Shipping that same defect into every client site is the
  expensive version of the same mistake. Next.js renders on the server by
  default.
- **Zero porting.** The skills drop in as written. Porting nineteen components
  off `next/image`, `next/font` and `'use client'` is work that buys nothing.
- **Deployment.** Vercel builds Next.js natively, which is the obvious target
  when the deploy step is eventually added.

Nothing forces a single stack: the scaffold creates a repo from a template and
commits `content.json`. How the template reads that file is the template's
business. Mixed stacks are fine and the registry already hides the difference
from the client.

## Decision 2 — each template declares its own content contract

### The contract

Every template repo gains a `template.json` at its root:

```json
{
  "id": "horizon",
  "stack": "next",
  "sections": ["hero", "manifesto", "features", "stats", "contactCta"]
}
```

`sections` names entries in a central section library held by the edge
function. The generator composes the JSON schema and the prompt from **only**
the listed sections, and `content.json` comes out holding only those keys.

### Where each fact lives, and why it is not a second list

| Fact | Home | Read by |
|---|---|---|
| id, name, blurb (and later, thumbnail) | `src/lib/websiteTemplates.js` | portal picker, intake validation |
| which sections this design needs | `template.json` in the template repo | the scaffold edge function |
| what a section's fields are | `sections.ts` in the edge function | schema + prompt builders |

These are three different concerns with three different owners, not one fact
written down three times. The picker needs its metadata in the app bundle; the
section list has to travel with the design it describes; the field shapes are
the generator's own vocabulary.

Specifically, the section list is **not** mirrored into
`src/lib/websiteTemplates.js`. Mirroring it would recreate exactly the bug
#117 just removed — a hand-maintained copy that someone updates in one place.
The scaffold fetches `template.json` over the GitHub contents API using the
PAT it already holds, immediately before generating copy, so the contract it
builds against is always the one in the repo it is about to clone.

### Failure behaviour

- `template.json` missing or unparseable → fall back to the current six-field
  `AiContent` set, so the existing Vite templates keep working untouched and no
  migration is required.
- A section name with no definition in the library → fail the project with
  `unknown section "<name>" in template-<id>` **before** the Claude call.
  Failing after the spend is strictly worse than failing before it.

### Section library (initial)

`hero`, `manifesto`, `about`, `services`, `features`, `stats`, `process`,
`testimonials`, `faq`, `pricing`, `gallery`, `logos`, `contactCta`, `meta`,
`footerTagline`.

`meta` and `footerTagline` are implicit — always generated, never declared.

## Decision 3 — the concept lineup

Six concepts, each built on a **different hero mechanic** so they read as
different designs rather than recolours. Component skills named per concept.

| Concept | Hero mechanic | Also uses | Sells to | Sections |
|---|---|---|---|---|
| **Horizon** | `design-horizon-hero` — generated WebGL, no photography needed | `design-text-scroll`, `design-parallax-features` | tech, architecture, premium services, any client with no photos | hero, manifesto, features, stats, contactCta |
| **Prisma** | `design-prisma-hero` — refracted light, video | `design-feature-carousel`, `design-testimonials` | creative studios, agencies, product brands | hero, features, testimonials, process, contactCta |
| **Reveal** | `design-scroll-expand-media` — photo grows to full bleed | `design-card-stack`, `design-voice-testimonials` | restaurants, hospitality, venues, real estate | hero, gallery, about, testimonials, contactCta |
| **Momentum** | `design-rotating-hero` — one line carries several claims | `design-features-x`, `design-spark-badge` | SaaS, B2B, consulting | hero, features, stats, pricing, faq, contactCta |
| **Coverage** | `design-features-map-chart` — dotted world map + charts | `design-parallax-features` | logistics, field services, multi-location, franchises | hero, features, stats, services, contactCta |
| **Current** | `design-liquid-background` — ambient liquid WebGL | `design-gradient-menu`, `design-text-scroll`, `design-testimonials` | wellness, medspa, salon, fitness | hero, manifesto, services, testimonials, contactCta |

`design-anti-metal-button`, `design-dot-border-button`, `design-spark-badge`
and `design-link-preview` are accents available to every concept rather than
concepts of their own.

## Build order

1. **Section library + per-template contract** in the edge function, with the
   missing-`template.json` fallback. Nothing visible changes; the six existing
   templates keep working.
2. **Horizon** end to end as the proving run — the first Next.js template, the
   first `template.json`, the first non-default section set. Everything
   structural that is wrong will surface here, on one template instead of six.
3. **The remaining five**, once Horizon has been generated for a real client
   and looked at.

## Out of scope, recorded

- The dead `pages` field, and multi-page output generally.
- Template thumbnails in the picker. Needed before the catalogue reaches ~10,
  and cheap once a deploy exists to screenshot.
- Deploying generated sites, and showing the client a preview + approval +
  revision loop. The brand-kit flow already has that shape; the website flow
  never got one. This is the largest remaining gap in the funnel and deserves
  its own spec.
