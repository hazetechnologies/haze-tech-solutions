# Website template system: asset-bearing contracts and an experiential concept line

**Date:** 2026-10-08
**Status:** design — lineup and build order pending approval
**Extends:** the funnel shipped in #7; the template registry in #117.

## Why now

The ask is a line of experiential templates: 3D sites, scroll-driven sites,
storytelling sites, interactive designs, a miniature architectural model that
opens into a full interior, and video backgrounds.

Reading the existing funnel first turned up one live defect — now fixed and
merged as #117 — and one structural gap that blocks every concept on that list.

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

Six template repos exist in `hazetechnologies`, all real GitHub templates, and
`template-scroll-motion/content.json` matches the `AiContent` contract. The
plumbing works.

### The gap that blocks the whole concept line

**`content.json` is text and nothing else.** Six fields: `hero`, `about`,
`services`, `contact_cta`, `meta`, `footer_tagline`. Grepping
`template-scroll-motion` for any image, video, model or `src=` reference
returns three CSS gradients and nothing more. There is not one asset slot in
the system.

Every concept on the list is asset-bearing:

| Concept | Needs |
|---|---|
| 3D websites | a scene — geometry, materials, environment lighting |
| Miniature architecture → interior | a GLB model, and a camera path through it |
| Video backgrounds | a video file, a poster frame, a mobile still |
| Storytelling | per-chapter media, in order |
| Interactive designs | hotspot coordinates, states, swatches |
| Scrollable | (already shipped — the one concept that is text-only) |

A generator that writes copy cannot deliver any of them. So the contract has to
carry two kinds of slot, and the funnel has to know where assets come from.
That is the real work; the templates are downstream of it.

### Also found, recorded, out of scope

- **`pages` is collected and discarded.** The intake offers Blog, Portfolio,
  FAQ and Pricing and passes them into the prompt; nothing renders a second
  page. The form sells what the build cannot deliver.
- **Nothing is ever seen.** No template thumbnails, no deploy step, no preview.
  The only output is a private GitHub repo URL. This matters more as the
  catalogue grows: ten templates chosen from a text blurb is worse than six.
  The brand-kit flow already has the preview→approve→revise shape the website
  flow never got. It deserves its own spec.

## Decision 1 — the experiential line is built on Next.js App Router

All nineteen `design-*` component skills target Next.js App Router. The
existing six templates are Vite + React 18 + GSAP.

**New templates target Next.js; the existing six stay on Vite.** In order of
weight:

- **SEO.** A Vite template ships a client-rendered page with one static head.
  This session spent a full cycle proving on hazetechsolutions.com that this is
  worth close to nothing to search engines, and had to add build-time shells to
  fix it. Baking that defect into every client site is the same mistake at
  scale. Next.js renders on the server by default.
- **Zero porting.** The skills drop in as written. Rewriting nineteen
  components off `next/image`, `next/font` and `'use client'` buys nothing.
- **Deployment.** Vercel builds Next.js natively, which is the obvious target
  once a deploy step exists.

Mixed stacks are fine: the scaffold creates a repo and commits `content.json`;
how a template reads that file is the template's business, and the registry
already hides the difference from the client.

## Decision 2 — contracts carry copy slots AND asset slots

Each template repo gains a `template.json` at its root:

```json
{
  "id": "atrium",
  "stack": "next",
  "copy":   ["hero", "chapters", "services", "contactCta"],
  "assets": [
    { "key": "scene",      "kind": "glb",   "source": "library", "required": true },
    { "key": "heroPoster", "kind": "image", "source": "render",  "required": true },
    { "key": "rooms",      "kind": "image", "source": "client",  "min": 3, "max": 8 }
  ]
}
```

`copy` names entries in a section library held by the edge function; the
generator builds its JSON schema and prompt from **only** those sections.
`assets` declares what the design cannot invent.

### Where each fact lives

| Fact | Home | Read by |
|---|---|---|
| id, name, blurb, tier, thumbnail | `src/lib/websiteTemplates.js` | portal picker, intake validation |
| which copy sections + asset slots this design needs | `template.json` in the template repo | the scaffold edge function |
| what a copy section's fields are | `sections.ts` in the edge function | schema + prompt builders |

Three concerns, three owners — not one fact written down three times. The
section list is deliberately **not** mirrored into the registry: a mirrored
list is exactly what made the flagship template return `400` for three months
(#117). The scaffold fetches `template.json` over the GitHub contents API with
the PAT it already holds, immediately before generating, so it always builds
against the contract in the repo it is about to clone.

### Asset sourcing ladder

Resolved in this order, first hit wins:

1. **`client`** — uploaded at intake. The intake form has no uploader today;
   adding one is part of this work.
2. **`brandKit`** — logo, palette, banners already generated for that client.
3. **`library`** — ships with the template. This is how 3D scales (below).
4. **`render`** — derived locally, e.g. a poster frame from a video, or a
   still of the 3D scene for the mobile fallback. Free.
5. **`generate`** — AI image or video via KIE / Seedance.

**`generate` is metered and never automatic.** It is the only rung that spends
money, and the scaffold must not reach it on its own. A project needing a
generated asset stops at a new `awaiting_assets` status with the cost stated,
and an operator releases it. The `scroll-websites` skill's own warning applies:
credits burn fast enough that the balance is checked before every job.

### Failure behaviour

- `template.json` missing or unparseable → fall back to the current six-field
  `AiContent`. The existing Vite templates keep working untouched; no migration.
- Unknown copy section, or unknown asset `kind`/`source` → fail the project
  with the offending name **before** the Claude call. Failing after the spend
  is strictly worse than failing before it.
- A `required` asset with no source resolvable → `awaiting_assets`, naming the
  slot. Never a half-built site with a missing-texture hole in it.

### Copy section library (initial)

`hero`, `manifesto`, `chapters`, `about`, `services`, `features`, `stats`,
`process`, `testimonials`, `faq`, `pricing`, `gallery`, `logos`, `contactCta`.
`meta` and `footerTagline` are implicit — always generated, never declared.

## Decision 3 — three dimensions of the concepts are non-negotiable

These apply to every template in the experiential line, and each has bitten
this kind of build before:

1. **Mobile gets a designed still, not a degraded scene.** A GLB interior is
   megabytes and a scrubbed video does not play on iOS without a gesture. The
   phone build shows a composed still and the real site below it. The
   `scroll-websites` skill states this as a design fact to be said out loud,
   not an apology to be made later.
2. **`prefers-reduced-motion` is a first-class path, not a disable switch.**
   Scroll-driven camera moves and scrubbed footage are exactly what that
   setting exists for.
3. **Delete-the-backdrop test.** With the 3D or video removed the page must
   still read and still sell. `scroll-3d-website-effects` records six PRs spent
   fixing a backdrop that fought its own copy. Contrast is measured against the
   darkest pixel, not eyeballed.

## Decision 4 — the concept lineup

Six concepts, each on a different mechanic, covering everything on the list.

| Concept | What the visitor experiences | Built from | Sells to |
|---|---|---|---|
| **Atrium** ⭐ | A cutaway architectural model floats in space; scrolling flies the camera down into it until you are standing inside the finished interior. Sections anchor to rooms. | react-three-fiber + drei, GLB scene, scroll-driven camera path | architects, interior designers, developers, hospitality, showrooms, furniture |
| **Orbit** | A generated WebGL world, no photography anywhere. | `design-horizon-hero`, `design-text-scroll`, `design-parallax-features` | tech, finance, professional services with no imagery |
| **Reel** | Footage scrubs frame by frame under the wheel, then settles into a real site. | `design-scroll-locked-video-hero`, `design-feature-carousel` | restaurants, gyms, events, travel — anyone with motion to show |
| **Chapters** | A narrative with a beginning, middle and end; media turns with the story. | `design-text-scroll`, `design-card-stack`, `design-scroll-expand-media` | nonprofits, founder brands, heritage brands, case-study consultancies |
| **Configure** | The visitor manipulates the thing — swatches, hotspots, states that persist. | react-three-fiber or layered 2D, `design-link-preview` | product brands, kitchens and cabinetry, auto, custom manufacturing |
| **Current** | Ambient liquid motion — a 3D feel at a fraction of the payload. | `design-liquid-background`, `design-gradient-menu`, `design-testimonials` | wellness, medspa, salon, fitness, beauty |

`design-anti-metal-button`, `design-dot-border-button`, `design-spark-badge`
are accents available to every concept, not concepts of their own.

### The constraint that decides whether Atrium is a product or a service

**The 3D scenes have to be a curated library, not bespoke modelling.** Atrium
ships with a handful of interiors — office, retail, restaurant, residential,
showroom — that are brand-tinted and re-lit per client from the brand kit, and
dressed with client photography in the frames and screens inside the scene.

Bespoke modelling per client is a different business: it is a modelling job
measured in days, it cannot be AI-generated reliably today, and it does not
survive contact with a self-serve funnel. Offering it as a paid upgrade on top
of a library scene is reasonable. Having the template *assume* it is not.

This also means the experiential line is a **second tier** in the catalogue,
materially more expensive to deliver than "Service Business." The picker should
say so rather than presenting twelve equal-looking cards.

## Build order

1. **Contract layer** — copy slots + asset slots + the sourcing ladder +
   `awaiting_assets`, with the missing-`template.json` fallback. Nothing
   visible changes and the six existing templates keep working.
2. **Orbit** — the proving run. First Next.js template, first `template.json`,
   first non-default section set, and it needs **zero assets**, so it tests the
   contract and the 3D stack without the asset pipeline confusing the result.
   Small enough to throw away if the contract is wrong.
3. **Atrium** — the flagship, and the first template to exercise an asset slot
   end to end, plus the mobile still and the reduced-motion path.
4. **Reel, Chapters, Configure, Current** — once Atrium has been generated for
   a real client and looked at.

Orbit before Atrium is deliberate: it isolates one new risk at a time. Building
the flagship first means a failure could be the contract, the stack, the asset
ladder or the 3D, with no way to tell which.
