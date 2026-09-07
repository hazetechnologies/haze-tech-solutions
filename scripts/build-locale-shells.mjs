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
// Routes NOT listed in LOCALIZED_ROUTES (blog posts, /audit/:id, admin, portal)
// keep falling through to the catch-all English shell — they are either gated,
// dynamic, or own their <head> already.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  LOCALES,
  LOCALE_CODES,
  DEFAULT_LOCALE,
  LOCALIZED_ROUTES,
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
    `<meta property="og:locale" content="${htmlLang.replace('-', '_')}" />`,
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
 * vercel.json must carry an explicit rewrite for every shell we emit.
 *
 * `vite preview` proved this matters: its SPA fallback shadowed all 30 static
 * shells and served the English index.html for /es/pricing. Vercel checks the
 * filesystem before rewrites and would probably resolve them anyway — but
 * "probably" is not a foundation for the whole SEO story, so the rules are
 * explicit and this guard fails the build if the route list and vercel.json
 * ever drift apart.
 */
async function assertRewrites(expectedPaths) {
  const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'))
  const sources = new Set((vercel.rewrites || []).map((r) => r.source))
  const missing = expectedPaths.filter((p) => p !== '/' && !sources.has(p))
  if (missing.length) {
    throw new Error(
      [
        `vercel.json is missing rewrites for ${missing.length} locale shell(s):`,
        ...missing.map((p) => `  ${p}`),
        'Regenerate them after changing LOCALIZED_ROUTES or LOCALES.',
      ].join('\n'),
    )
  }
}

async function main() {
  if (!existsSync(baseFile)) {
    throw new Error(`dist/index.html not found — run \`vite build\` first (looked in ${distDir})`)
  }
  const base = await readFile(baseFile, 'utf8')

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
      `(${LOCALE_CODES.length} locales × ${LOCALIZED_ROUTES.length} routes), ` +
      'vercel.json rewrites verified',
  )
}

main().catch((err) => {
  console.error('[locale-shells] FAILED:', err.message)
  process.exit(1)
})
