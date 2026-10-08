// The website template catalogue — ONE source of truth.
//
// This file exists because the id list had drifted into four places. PR #98
// added `scroll-motion` to the portal picker and nowhere else, so from
// 2026-07-19 every client who chose the flagship template hit
// `400 Invalid template_id` from api/website.js. The picker advertised a
// template the API refused to accept.
//
// Consumers:
//   - src/pages/portal/PortalWebsiteIntake.jsx  (renders the picker)
//   - api/website.js                            (validates ?action=intake)
//
// Adding a template means: create the `template-<id>` GitHub template repo in
// the hazetechnologies org (it must contain a content.json matching
// supabase/functions/generate-website-scaffold/types.ts AiContent), then add
// one entry here. The scaffold edge function derives the repo name from the id
// as `template-${id}`, so the id and the repo name cannot be chosen separately.

export const WEBSITE_TEMPLATES = [
  {
    id: 'scroll-motion',
    name: 'Scroll & Motion',
    blurb:
      'Premium animated one-page site — scroll-driven reveals, parallax motion, and 3D hover. Designed to turn heads.',
  },
  {
    id: 'service-business',
    name: 'Service Business',
    blurb: 'For trades, consulting, and local services. Strong CTAs, simple bookings.',
  },
  {
    id: 'local-business',
    name: 'Local Business',
    blurb: 'Maps, hours, location-first. Great for restaurants and shops.',
  },
  {
    id: 'creative-portfolio',
    name: 'Creative Portfolio',
    blurb: 'Image-led, project showcase, gallery. For designers and creators.',
  },
  {
    id: 'saas-landing',
    name: 'SaaS / Product Landing',
    blurb: 'Hero + features + pricing. Built for software products.',
  },
  {
    id: 'travel-agency',
    name: 'Travel Agency',
    blurb: 'Destinations, packages, booking — for travel and tour operators.',
  },
]

/** Ids the intake endpoint accepts. Derived, never hand-maintained. */
export const WEBSITE_TEMPLATE_IDS = WEBSITE_TEMPLATES.map((t) => t.id)

export function isValidTemplateId(id) {
  return WEBSITE_TEMPLATE_IDS.includes(id)
}
