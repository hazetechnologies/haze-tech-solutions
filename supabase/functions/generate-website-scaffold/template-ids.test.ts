// The template id is not just a key — the scaffold turns it into a GitHub repo
// name (`template-${id}`) and a repo slug. An id with a space, an uppercase
// letter or a stray character fails at GitHub's create-from-template call,
// after the Claude copy spend has already happened.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

const registrySrc = await Deno.readTextFile(
  new URL('../../../src/lib/websiteTemplates.js', import.meta.url),
)

const ids = [...registrySrc.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((m) => m[1])

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

Deno.test('the flagship template is selectable', () => {
  // Regression guard for PR #98: the picker offered scroll-motion while the
  // API allowlist did not, so choosing it returned 400 Invalid template_id.
  assert(ids.includes('scroll-motion'), 'scroll-motion missing from the registry')
})
