// Post-build step: emit one static HTML shell per (locale × translated route).
//
// Why this exists
// ---------------
// This is a client-rendered SPA. If every language shared one URL and one
// <head>, the translations would be worth roughly nothing for search: Google
// indexes URLs, not React state. Even with per-language URLs, a single shell
// would hand every crawler the English <title> and description on first byte.
//
// So after `vite build` we stamp out a real file for each page in each
// language, with the correct lang/title/description/canonical and the full
// hreflang cluster. Vercel serves static files before the SPA catch-all
// rewrite, so /es/pricing gets Spanish HTML with no JavaScript required, and
// the app then hydrates over it.
//
// Routes NOT listed in LOCALIZED_ROUTES (blog posts, /audit, /cart, admin,
// portal) fall through to app.html — a copy of Vite's own output with an empty
// head. They must NOT be served dist/index.html: that is the English homepage
// shell, and serving it as the fallback stamped `canonical=<site root>` and the
// homepage hreflang cluster onto every blog post on the site.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  LOCALES,
  LOCALE_CODES,
  DEFAULT_LOCALE,
  LOCALIZED_ROUTES,
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const baseFile = path.join(distDir, 'index.html')
const fallbackFile = path.join(distDir, SPA_FALLBACK_FILE.replace(/^\//, ''))

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
  return html.replace('</head>', `    ${tag}\n  </head>`)
}

function buildHead(html, { locale, route }) {
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
  out = upsert(
    out,
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${description}" />`,
  )
  out = upsert(
    out,
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${title}" />`,
  )
  out = upsert(
    out,
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${description}" />`,
  )
  out = upsert(
    out,
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${canonical}" />`,
  )
  out = upsert(
    out,
    /<meta property="og:locale" content="[^"]*"\s*\/?>/,
    `<meta property="og:locale" content="${LOCALES[locale].ogLocale}" />`,
  )
  out = upsert(
    out,
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonical}" />`,
  )

  // Full hreflang cluster: every language points at every language, including
  // itself, plus x-default on English. Google discards one-sided clusters.
  const alternates = [
    ...LOCALE_CODES.map(
      (code) =>
        `<link rel="alternate" hreflang="${LOCALES[code].hreflang}" href="${absoluteUrl(route.path, code)}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${absoluteUrl(route.path, DEFAULT_LOCALE)}" />`,
  ]
  out = out.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>/g, '')
  out = out.replace('</head>', `    ${alternates.join('\n    ')}\n  </head>`)

  return out
}

/**
 * vercel.json must match, exactly, the shells we just wrote.
 *
 * An earlier version of this guard only checked that each emitted path appeared
 * as *some* rewrite source. Review defeated it three ways without it noticing:
 * moving the catch-all to the front (shadowing all 30 shells), pointing every
 * destination at the same file, and deleting a locale (leaving six rewrites
 * aimed at files a clean build no longer emits — a 404 on Vercel, while those
 * URLs stay in the sitemap and in every remaining page's hreflang cluster).
 *
 * So it now checks source->destination pairs both ways, that each destination
 * exists on disk, and that the catch-all is last and points at the neutral
 * fallback rather than the homepage shell.
 */
async function assertRewrites(expectedPaths) {
  const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'))
  const rewrites = vercel.rewrites || []
  const problems = []

  const shellPaths = expectedPaths.filter((p) => p !== '/')
  const bySource = new Map(rewrites.map((r) => [r.source, r.destination]))

  for (const p of shellPaths) {
    const want = `${p}/index.html`
    if (!bySource.has(p)) problems.push(`missing rewrite for shell ${p}`)
    else if (bySource.get(p) !== want) {
      problems.push(`rewrite ${p} -> ${bySource.get(p)} (expected ${want})`)
    }
  }

  // The reverse direction: a rewrite pointing at a shell we no longer emit
  // would 404 in production.
  const expected = new Set(shellPaths)
  for (const r of rewrites) {
    if (!/\/index\.html$/.test(r.destination || '')) continue
    if (!expected.has(r.source)) {
      problems.push(`stale rewrite ${r.source} -> ${r.destination} (no shell is emitted for it)`)
      continue
    }
    const onDisk = path.join(distDir, r.destination.replace(/^\//, ''))
    if (!existsSync(onDisk)) problems.push(`rewrite ${r.source} points at missing file ${r.destination}`)
  }

  const last = rewrites[rewrites.length - 1]
  if (!last || !last.source.startsWith('/((?!api/)')) {
    problems.push('the SPA catch-all must be the LAST rewrite, or it shadows every shell')
  } else if (last.destination !== SPA_FALLBACK_FILE) {
    problems.push(
      `the SPA catch-all points at ${last.destination}; it must be ${SPA_FALLBACK_FILE}. ` +
        'Serving /index.html there gives every unlisted URL the homepage canonical and hreflang.',
    )
  }

  if (!existsSync(fallbackFile)) problems.push(`${SPA_FALLBACK_FILE} was not written to dist`)

  if (problems.length) {
    throw new Error(
      ['vercel.json does not match the generated shells:', ...problems.map((p) => `  ${p}`)].join(
        String.fromCharCode(10),
      ),
    )
  }
}

async function main() {
  if (!existsSync(baseFile)) {
    throw new Error(`dist/index.html not found — run \`vite build\` first (looked in ${distDir})`)
  }
  const base = await readFile(baseFile, 'utf8')

  // The neutral SPA fallback, written from Vite's own output BEFORE index.html
  // is replaced by the English homepage shell. Any canonical/hreflang is
  // stripped so that /blog/<post>, /audit, /cart and 404s inherit nothing.
  const neutral = base
    .replace(/\s*<link rel="canonical" href="[^"]*"\s*\/?>/g, '')
    .replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>/g, '')
  await writeFile(fallbackFile, neutral, 'utf8')

  const emitted = []
  let written = 0
  for (const locale of LOCALE_CODES) {
    for (const route of LOCALIZED_ROUTES) {
      const html = buildHead(base, { locale, route })
      const urlPath = localizePath(route.path, locale)

      // '/' -> dist/index.html ; '/es' -> dist/es/index.html ;
      // '/es/services/ai-automation' -> dist/es/services/ai-automation/index.html
      const outFile =
        urlPath === '/'
          ? baseFile
          : path.join(distDir, ...urlPath.replace(/^\//, '').split('/'), 'index.html')

      await mkdir(path.dirname(outFile), { recursive: true })
      await writeFile(outFile, html, 'utf8')
      emitted.push(urlPath)
      written += 1
    }
  }

  await assertRewrites(emitted)

  console.log(
    `[locale-shells] wrote ${written} static shells ` +
      `(${LOCALE_CODES.length} locales × ${LOCALIZED_ROUTES.length} routes) ` +
      `+ neutral ${SPA_FALLBACK_FILE}, vercel.json verified`,
  )
}

main().catch((err) => {
  console.error('[locale-shells] FAILED:', err.message)
  process.exit(1)
})
