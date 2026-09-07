// Post-build step: emit one static HTML shell per indexable page.
//
// Why this exists
// ---------------
// This is a client-rendered SPA. If every language shared one URL and one
// <head>, the translations would be worth roughly nothing for search: Google
// indexes URLs, not React state. Even with per-language URLs, a single shell
// would hand every crawler the English <title> and description on first byte.
//
// Two kinds of shell come out of here:
//   LOCALIZED_ROUTES    x every locale -> localized head + full hreflang cluster
//   ENGLISH_ONLY_ROUTES (English only) -> English head, self-canonical, NO hreflang
//
// Everything else (blog posts, /cart, admin, portal, 404s) falls through to
// app.html — Vite's own output with the per-page tags removed. Those must NOT be
// served dist/index.html: that is the English homepage shell, and using it as
// the fallback stamped `canonical=<site root>` and the homepage hreflang cluster
// onto every blog post on the site.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  LOCALES,
  LOCALE_CODES,
  PREFIXED_LOCALES,
  DEFAULT_LOCALE,
  LOCALIZED_ROUTES,
  ENGLISH_ONLY_ROUTES,
  SPA_FALLBACK_FILE,
  localizePath,
  absoluteUrl,
} from '../src/i18n/config.js'

import en from '../src/i18n/locales/en.js'
import es from '../src/i18n/locales/es.js'
import pt from '../src/i18n/locales/pt.js'
import fr from '../src/i18n/locales/fr.js'
import de from '../src/i18n/locales/de.js'

const DICTS = { en, es, pt, fr, de }
const NL = String.fromCharCode(10)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const baseFile = path.join(distDir, 'index.html')
const fallbackFile = path.join(distDir, SPA_FALLBACK_FILE.replace(/^\//, ''))

// Non-shell rewrites that are allowed to exist, with their exact destination.
// An allowlist rather than a "looks plausible" check: an earlier guard passed a
// config that had simply DELETED the /sitemap.xml rule — the exact incident
// api/sitemap.js was written to fix.
const ALLOWED_EXTRA_REWRITES = new Map([['/sitemap.xml', '/api/sitemap']])

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Replace an existing tag if present, otherwise insert before </head>. */
function upsert(html, matcher, tag) {
  if (matcher.test(html)) return html.replace(matcher, tag)
  return html.replace('</head>', `    ${tag}${NL}  </head>`)
}

/**
 * @param {boolean} alternates emit the hreflang cluster. False for English-only
 *   pages, which must not advertise translations that do not exist.
 */
function buildHead(html, { locale, route, alternates }) {
  const dict = DICTS[locale] || DICTS[DEFAULT_LOCALE]
  const seo = dict.seo?.[route.key] || DICTS[DEFAULT_LOCALE].seo[route.key]
  if (!seo) throw new Error(`No seo entry for route key "${route.key}" (locale ${locale})`)

  const title = escapeAttr(seo.title)
  const description = escapeAttr(seo.description)
  const canonical = absoluteUrl(route.path, locale)
  const htmlLang = LOCALES[locale].htmlLang

  let out = html
  out = out.replace(/<html lang="[^"]*"/, `<html lang="${htmlLang}"`)
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
  out = upsert(out, /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${description}" />`)
  out = upsert(out, /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${title}" />`)
  out = upsert(out, /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${description}" />`)
  out = upsert(out, /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${canonical}" />`)
  out = upsert(out, /<meta property="og:locale" content="[^"]*"\s*\/?>/,
    `<meta property="og:locale" content="${LOCALES[locale].ogLocale}" />`)
  out = upsert(out, /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonical}" />`)

  out = out.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>/g, '')
  if (alternates) {
    // Reciprocal and self-referential, plus one x-default on English. Google
    // discards one-sided clusters.
    const links = [
      ...LOCALE_CODES.map((code) =>
        `<link rel="alternate" hreflang="${LOCALES[code].hreflang}" href="${absoluteUrl(route.path, code)}" />`),
      `<link rel="alternate" hreflang="x-default" href="${absoluteUrl(route.path, DEFAULT_LOCALE)}" />`,
    ]
    out = out.replace('</head>', `    ${links.join(NL + '    ')}${NL}  </head>`)
  }
  return out
}

/**
 * Strip every per-page tag so the fallback advertises nothing about which page
 * it is standing in for.
 *
 * This must be idempotent. `base` comes from dist/index.html, which this same
 * script later overwrites with the homepage shell — so re-running the script
 * without re-running `vite build` reads an already-stamped file. Removing
 * og:url as well as canonical/hreflang is what makes the second pass produce
 * the same neutral output as the first; `assertFallbackIsNeutral` then proves
 * it rather than trusting it.
 */
function neutralise(html) {
  return html
    .replace(/\s*<link rel="canonical" href="[^"]*"\s*\/?>/g, '')
    .replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>/g, '')
    .replace(/\s*<meta property="og:url" content="[^"]*"\s*\/?>/g, '')
}

function assertFallbackIsNeutral(html) {
  const offenders = []
  if (/rel="canonical"/.test(html)) offenders.push('rel="canonical"')
  if (/hreflang=/.test(html)) offenders.push('hreflang')
  if (/property="og:url"/.test(html)) offenders.push('og:url')
  if (offenders.length) {
    throw new Error(
      `${SPA_FALLBACK_FILE} still carries page-specific tags (${offenders.join(', ')}). ` +
        'It is served for every blog post and 404, so anything page-specific in it is wrong for all of them.',
    )
  }
}

/**
 * vercel.json must match, exactly, the shells we just wrote — and contain
 * nothing else beyond an explicit allowlist.
 *
 * Earlier versions of this guard were defeated seven ways in review: moving the
 * catch-all to the front, pointing every destination at one file, leaving
 * rewrites for a deleted locale, aiming the catch-all back at the homepage
 * shell, adding a DUPLICATE source that shadows the real rule, adding a broad
 * `/(es|pt|fr|de)/:path*` rule whose destination is not an index.html, and
 * deleting the /sitemap.xml rule. Hence: exact set, exact destinations, no
 * duplicates, allowlisted extras, fixed ordering.
 */
async function assertRewrites(expectedPaths) {
  const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'))
  const rewrites = vercel.rewrites || []
  const problems = []

  const seen = new Set()
  for (const r of rewrites) {
    if (seen.has(r.source)) {
      problems.push(`duplicate source ${r.source} — Vercel matches the FIRST, a guard would check the last`)
    }
    seen.add(r.source)
  }

  const shells = new Map(expectedPaths.map((p) => [p, `${p}/index.html`]))
  for (const src of shells.keys()) {
    if (!seen.has(src)) problems.push(`missing rewrite for shell ${src}`)
  }

  const catchAll = rewrites[rewrites.length - 1]
  for (let i = 0; i < rewrites.length; i++) {
    const r = rewrites[i]
    if (i === rewrites.length - 1 && String(r.source).startsWith('/((?!api/)')) continue
    if (shells.has(r.source)) {
      if (r.destination !== shells.get(r.source)) {
        problems.push(`rewrite ${r.source} -> ${r.destination} (expected ${shells.get(r.source)})`)
      } else if (!existsSync(path.join(distDir, r.destination.replace(/^\//, '')))) {
        problems.push(`rewrite ${r.source} points at missing file ${r.destination}`)
      }
      continue
    }
    if (ALLOWED_EXTRA_REWRITES.has(r.source)) {
      const want = ALLOWED_EXTRA_REWRITES.get(r.source)
      if (r.destination !== want) {
        problems.push(`rewrite ${r.source} -> ${r.destination} (allowlisted destination is ${want})`)
      }
      continue
    }
    problems.push(
      `unrecognised rewrite ${r.source} -> ${r.destination}. It is neither a generated ` +
        'shell nor allowlisted, and a broad rule here can shadow every shell.',
    )
  }

  for (const src of ALLOWED_EXTRA_REWRITES.keys()) {
    if (!seen.has(src)) problems.push(`required rewrite ${src} is missing — the catch-all would swallow it`)
  }

  if (!catchAll || !String(catchAll.source).startsWith('/((?!api/)')) {
    problems.push('the SPA catch-all must be the LAST rewrite, or it shadows every shell')
  } else if (catchAll.destination !== SPA_FALLBACK_FILE) {
    problems.push(
      `the SPA catch-all points at ${catchAll.destination}; it must be ${SPA_FALLBACK_FILE}. ` +
        'Serving /index.html there gives every unlisted URL the homepage canonical and hreflang.',
    )
  }

  const expectedCount = shells.size + ALLOWED_EXTRA_REWRITES.size + 1
  if (rewrites.length !== expectedCount) {
    problems.push(`vercel.json has ${rewrites.length} rewrites; expected exactly ${expectedCount}`)
  }

  if (!existsSync(fallbackFile)) problems.push(`${SPA_FALLBACK_FILE} was not written to dist`)

  if (problems.length) {
    throw new Error(
      ['vercel.json does not match the generated shells:', ...problems.map((p) => `  ${p}`)].join(NL),
    )
  }
}

/**
 * robots.txt names the gated areas per locale prefix and is hand-maintained, so
 * adding a locale would otherwise leave /it/admin crawlable with nothing to
 * catch it.
 */
async function assertRobots() {
  const txt = await readFile(path.join(root, 'public', 'robots.txt'), 'utf8')
  const missing = []
  for (const code of PREFIXED_LOCALES) {
    for (const area of ['admin', 'portal']) {
      if (!txt.includes(`Disallow: /${code}/${area}`)) missing.push(`/${code}/${area}`)
    }
  }
  if (!txt.includes(`Disallow: ${SPA_FALLBACK_FILE}`)) missing.push(SPA_FALLBACK_FILE)
  if (missing.length) {
    throw new Error(
      ['public/robots.txt is missing Disallow rules for:', ...missing.map((m) => `  ${m}`)].join(NL),
    )
  }
}

async function main() {
  if (!existsSync(baseFile)) {
    throw new Error(`dist/index.html not found — run \`vite build\` first (looked in ${distDir})`)
  }
  const base = await readFile(baseFile, 'utf8')

  const neutral = neutralise(base)
  assertFallbackIsNeutral(neutral)
  await writeFile(fallbackFile, neutral, 'utf8')

  const emitted = []
  const write = async (urlPath, html) => {
    const outFile =
      urlPath === '/'
        ? baseFile
        : path.join(distDir, ...urlPath.replace(/^\//, '').split('/'), 'index.html')
    await mkdir(path.dirname(outFile), { recursive: true })
    await writeFile(outFile, html, 'utf8')
    if (urlPath !== '/') emitted.push(urlPath)
  }

  let localized = 0
  for (const locale of LOCALE_CODES) {
    for (const route of LOCALIZED_ROUTES) {
      await write(localizePath(route.path, locale), buildHead(base, { locale, route, alternates: true }))
      localized += 1
    }
  }

  let englishOnly = 0
  for (const route of ENGLISH_ONLY_ROUTES) {
    await write(route.path, buildHead(base, { locale: DEFAULT_LOCALE, route, alternates: false }))
    englishOnly += 1
  }

  await assertRewrites(emitted)
  await assertRobots()

  console.log(
    `[locale-shells] ${localized} localized shells ` +
      `(${LOCALE_CODES.length} locales x ${LOCALIZED_ROUTES.length} routes) + ` +
      `${englishOnly} English-only shells + neutral ${SPA_FALLBACK_FILE}; ` +
      'vercel.json and robots.txt verified',
  )
}

main().catch((err) => {
  console.error('[locale-shells] FAILED:', err.message)
  process.exit(1)
})
