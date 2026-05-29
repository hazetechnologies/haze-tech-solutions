// supabase/functions/generate-brand-kit/compose-banner.ts
//
// Deterministic banner compositor. KIE generates a scenery-ONLY background
// (no logo, no text, no panels); this module overlays the logo + tagline +
// CTA at exact pixel coordinates inside each platform's safe area. This
// replaces prompt-based placement, which the image model couldn't honor —
// it kept cropping the logo and inventing opaque "legibility" panels that
// covered the scenery.
//
// Uses imagescript (pure JS) — sharp's native binary won't load in the
// Supabase Deno Edge Runtime.
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts'
import type { ImageAssetId, ColorPaletteEntry } from './types.ts'

const FONT_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-SemiBold.ttf'
let _font: Uint8Array | null = null
let _fontInFlight: Promise<Uint8Array> | null = null
async function loadFont(): Promise<Uint8Array> {
  if (_font) return _font
  // Single-flight: parallel callers share one fetch rather than each opening
  // their own 157KB request.
  if (!_fontInFlight) {
    _fontInFlight = (async () => {
      const res = await fetch(FONT_URL)
      if (!res.ok) throw new Error(`font fetch failed: ${res.status}`)
      _font = new Uint8Array(await res.arrayBuffer())
      return _font
    })()
  }
  return _fontInFlight
}

// "#RRGGBB" -> imagescript color int 0xRRGGBBAA
function hexToColor(hex: string, alpha = 255): number {
  const h = (hex || '#000000').replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return ((r << 24) | (g << 16) | (b << 8) | (alpha & 0xff)) >>> 0
}

function paletteHex(palette: ColorPaletteEntry[], name: string, fallback: string): string {
  return palette.find((c) => c.name === name)?.hex || fallback
}

interface BannerLayout {
  mode: 'horizontal' | 'vertical' | 'logo-only'
  box: { x: number; y: number; w: number; h: number }   // content region, final px
  logoH: number                                          // target logo height, px
  taglineSize: number
  ctaSize: number
  withCopy: boolean                                      // false for tiny/circle assets
}

// Layouts in FINAL pixel coordinates (compositing happens after resize).
function layoutFor(assetId: ImageAssetId, W: number, H: number): BannerLayout {
  switch (assetId) {
    case 'banner_yt': // 2560×1440, content must stay in the centered 1546×423 TV-safe strip
      return { mode: 'horizontal', box: { x: 560, y: 540, w: 1440, h: 360 }, logoH: 360, taglineSize: 74, ctaSize: 52, withCopy: true }
    case 'banner_x': // 1500×500, avoid bottom-left profile-pic overlap
      return { mode: 'horizontal', box: { x: 440, y: 110, w: 1010, h: 280 }, logoH: 250, taglineSize: 52, ctaSize: 38, withCopy: true }
    case 'banner_linkedin_cover': // 1128×191, very short
      return { mode: 'horizontal', box: { x: 60, y: 24, w: 1010, h: 143 }, logoH: 135, taglineSize: 34, ctaSize: 26, withCopy: true }
    case 'banner_fb': // 820×312
      return { mode: 'horizontal', box: { x: 50, y: 60, w: 720, h: 192 }, logoH: 175, taglineSize: 40, ctaSize: 30, withCopy: true }
    case 'banner_ig': // 1080×1920 vertical story
      return { mode: 'vertical', box: { x: 110, y: 340, w: 860, h: 940 }, logoH: 480, taglineSize: 76, ctaSize: 54, withCopy: true }
    case 'banner_tiktok': // 200×200 — too small for copy
      return { mode: 'logo-only', box: { x: 20, y: 20, w: 160, h: 160 }, logoH: 150, taglineSize: 0, ctaSize: 0, withCopy: false }
    case 'profile_picture': // 1024×1024, circle-cropped
      return { mode: 'logo-only', box: { x: 162, y: 162, w: 700, h: 700 }, logoH: 620, taglineSize: 0, ctaSize: 0, withCopy: false }
    default:
      return { mode: 'horizontal', box: { x: Math.round(W * 0.1), y: Math.round(H * 0.3), w: Math.round(W * 0.8), h: Math.round(H * 0.4) }, logoH: Math.round(H * 0.3), taglineSize: 44, ctaSize: 32, withCopy: true }
  }
}

// Soft dark scrim so a white logo + white text stay legible over bright
// scenery WITHOUT a hard-edged opaque box. Feathered BAND profile: a flat
// fully-dark plateau across the middle (so the whole content row — logo at
// left, CTA at right — is evenly darkened) with soft fades at all four
// edges. Built small then scaled up for a smooth gradient.
function makeScrim(w: number, h: number, peakAlpha = 150, fx = 0.12, fy = 0.22): Image {
  const G = 64
  const grad = new Image(G, G)
  const ramp = (p: number, f: number) => {
    if (p < f) return p / f
    if (p > 1 - f) return (1 - p) / f
    return 1
  }
  for (let y = 0; y < G; y++) {
    const vy = ramp((y + 0.5) / G, fy)
    for (let x = 0; x < G; x++) {
      const vx = ramp((x + 0.5) / G, fx)
      const t = Math.max(0, Math.min(1, vx * vy))
      const s = t * t * (3 - 2 * t) // smoothstep
      const a = Math.round(peakAlpha * s)
      grad.setPixelAt(x + 1, y + 1, ((10 << 24) | (12 << 16) | (18 << 8) | a) >>> 0)
    }
  }
  grad.resize(w, h)
  return grad
}

// Greedy word-wrap by estimated width. Poppins SemiBold averages ~0.54em.
function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const approxCharW = fontSize * 0.54
  const maxChars = Math.max(6, Math.floor(maxWidth / approxCharW))
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w
    if (candidate.length > maxChars && line) {
      lines.push(line)
      line = w
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 3)
}

// Composite a soft dark glow directly behind the logo so a white/light logo
// always reads, regardless of how bright the scenery is at that spot. Sized
// a bit larger than the logo and centered on it.
function backLogoGlow(bg: Image, logoX: number, logoY: number, logoW: number, logoH: number): void {
  const padX = Math.round(logoW * 0.35)
  const padY = Math.round(logoH * 0.45)
  const gw = logoW + padX * 2
  const gh = logoH + padY * 2
  bg.composite(makeScrim(gw, gh, 175, 0.3, 0.3), logoX - padX, logoY - padY)
}

// Resize an image to a target HEIGHT, preserving aspect ratio.
function resizeToHeight(img: Image, targetH: number): Image {
  if (img.height === targetH) return img
  const scale = targetH / img.height
  img.resize(Math.max(1, Math.round(img.width * scale)), targetH)
  return img
}

// Build a stadium-shaped CTA pill with the label centered inside it.
async function makeCtaPill(font: Uint8Array, label: string, fontSize: number, fillHex: string, textHex: string): Promise<Image> {
  const text = await Image.renderText(font, fontSize, label, hexToColor(textHex, 255))
  const padX = Math.round(fontSize * 0.9)
  const padY = Math.round(fontSize * 0.55)
  const pillW = text.width + padX * 2
  const pillH = text.height + padY * 2
  const r = Math.floor(pillH / 2)
  const pill = new Image(pillW, pillH)
  const fill = hexToColor(fillHex, 255)
  // center rectangle + rounded ends
  pill.drawBox(r + 1, 1, Math.max(1, pillW - 2 * r), pillH, fill)
  pill.drawCircle(r, Math.floor(pillH / 2), r, fill)
  pill.drawCircle(pillW - r, Math.floor(pillH / 2), r, fill)
  pill.composite(text, Math.round((pillW - text.width) / 2), Math.round((pillH - text.height) / 2))
  return pill
}

export interface ComposeArgs {
  background: Uint8Array          // scenery at FINAL dims
  logo: Uint8Array                // brand logo (png, may be transparent)
  tagline: string
  cta: string
  palette: ColorPaletteEntry[]
  assetId: ImageAssetId
}

export async function composeBanner(args: ComposeArgs): Promise<Uint8Array> {
  const { background, logo, tagline, cta, palette, assetId } = args
  const bg = await Image.decode(background) as Image
  const W = bg.width, H = bg.height
  const layout = layoutFor(assetId, W, H)
  const { box } = layout

  const accentHex = paletteHex(palette, 'accent', '#C29669')
  const lightHex = '#FFFFFF'

  const font = await loadFont()
  const logoImg = await Image.decode(logo) as Image

  if (layout.mode === 'logo-only') {
    const lg = resizeToHeight(logoImg, layout.logoH)
    const lx = Math.round(box.x + (box.w - lg.width) / 2)
    const ly = Math.round(box.y + (box.h - lg.height) / 2)
    backLogoGlow(bg, lx, ly, lg.width, lg.height)
    bg.composite(lg, lx, ly)
    return new Uint8Array(await bg.encode())
  }

  // Soft scrim behind the whole content box for text legibility.
  bg.composite(makeScrim(box.w, box.h, 200), box.x, box.y)

  const lg = resizeToHeight(logoImg, layout.logoH)

  // Render tagline lines.
  const taglineLines = layout.withCopy && tagline ? wrapText(tagline, layout.taglineSize, layout.mode === 'horizontal' ? box.w - lg.width - 60 : box.w) : []
  const taglineImgs: Image[] = []
  for (const ln of taglineLines) {
    taglineImgs.push(await Image.renderText(font, layout.taglineSize, ln, hexToColor(lightHex, 255)))
  }
  const lineGap = Math.round(layout.taglineSize * 0.28)
  const taglineH = taglineImgs.reduce((s, im) => s + im.height, 0) + Math.max(0, taglineImgs.length - 1) * lineGap
  const taglineW = taglineImgs.reduce((m, im) => Math.max(m, im.width), 0)

  const pill = layout.withCopy && cta ? await makeCtaPill(font, cta, layout.ctaSize, accentHex, lightHex) : null
  const ctaGap = Math.round(layout.taglineSize * 0.5)

  if (layout.mode === 'horizontal') {
    // Logo on the left, tagline + CTA stacked on the right, vertically centered.
    const logoX = box.x
    const logoY = Math.round(box.y + (box.h - lg.height) / 2)
    backLogoGlow(bg, logoX, logoY, lg.width, lg.height)
    bg.composite(lg, logoX, logoY)

    const copyX = logoX + lg.width + 60
    const copyBlockH = taglineH + (pill ? ctaGap + pill.height : 0)
    let cy = Math.round(box.y + (box.h - copyBlockH) / 2)
    for (const im of taglineImgs) {
      bg.composite(im, copyX, cy)
      cy += im.height + lineGap
    }
    if (pill) {
      bg.composite(pill, copyX, cy - lineGap + ctaGap)
    }
  } else {
    // Vertical: logo on top (centered), tagline below, CTA below that.
    const cxCenter = box.x + box.w / 2
    let cy = box.y
    const lgx = Math.round(cxCenter - lg.width / 2)
    backLogoGlow(bg, lgx, cy, lg.width, lg.height)
    bg.composite(lg, lgx, cy)
    cy += lg.height + Math.round(layout.taglineSize * 0.9)
    for (const im of taglineImgs) {
      bg.composite(im, Math.round(cxCenter - im.width / 2), cy)
      cy += im.height + lineGap
    }
    if (pill) {
      cy += ctaGap
      bg.composite(pill, Math.round(cxCenter - pill.width / 2), cy)
    }
    void taglineW
  }

  return new Uint8Array(await bg.encode())
}
