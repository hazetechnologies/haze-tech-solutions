// The template id is not just a key — the scaffold turns it into a GitHub repo
// name (`template-${id}`), so an id with a space, an uppercase letter or a
// stray character fails at GitHub's create-from-template call, AFTER the
// Claude copy spend has already happened.
//
// The registry is imported, not read off disk: a static import needs no
// permission, so this runs under a bare `deno test` like every other test in
// the repo, and it checks the real exported value rather than a regex over the
// source text.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { WEBSITE_TEMPLATES, WEBSITE_TEMPLATE_IDS, isValidTemplateId }
  from '../../../src/lib/websiteTemplates.js'

const ids: string[] = WEBSITE_TEMPLATE_IDS

Deno.test('registry exposes templates', () => {
  assert(ids.length > 0, 'WEBSITE_TEMPLATES is empty')
})

Deno.test('every id is a legal GitHub repo name segment', () => {
  for (const id of ids) {
    assert(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id), `id "${id}" is not lowercase-kebab`)
  }
})

Deno.test('ids are unique', () => {
  assertEquals(new Set(ids).size, ids.length, `duplicate id in ${JSON.stringify(ids)}`)
})

Deno.test('every template is renderable in the picker', () => {
  for (const t of WEBSITE_TEMPLATES) {
    assert(t.name && t.name.trim().length > 0, `template "${t.id}" has no name`)
    assert(t.blurb && t.blurb.trim().length > 0, `template "${t.id}" has no blurb`)
  }
})

Deno.test('the flagship template is selectable', () => {
  // Regression guard for PR #98: the picker offered scroll-motion while the
  // API allowlist did not, so choosing it returned 400 Invalid template_id.
  assert(isValidTemplateId('scroll-motion'), 'scroll-motion is not accepted by the intake validator')
})

Deno.test('validator rejects an unknown id', () => {
  assert(!isValidTemplateId('not-a-real-template'), 'validator accepted an unknown id')
})
