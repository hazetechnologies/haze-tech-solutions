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
  withCta: boolean                                       // CTA button only on the YouTube cover
}

// Layouts in FINAL pixel coordinates (compositing happens after resize).
function layoutFor(assetId: ImageAssetId, W: number, H: number): BannerLayout {
  switch (assetId) {
    case 'banner_yt': // 2560×1440, content must stay in the centered 1546×423 TV-safe strip
      return { mode: 'horizontal', box: { x: 560, y: 540, w: 1440, h: 360 }, logoH: 360, taglineSize: 74, ctaSize: 52, withCopy: true, withCta: true }
    case 'banner_x': // 1500×500, avoid bottom-left profile-pic overlap
      return { mode: 'horizontal', box: { x: 440, y: 110, w: 1010, h: 280 }, logoH: 250, taglineSize: 52, ctaSize: 38, withCopy: true, withCta: false }
    case 'banner_linkedin_cover': // 1128×191, very short
      return { mode: 'horizontal', box: { x: 60, y: 24, w: 1010, h: 143 }, logoH: 135, taglineSize: 34, ctaSize: 26, withCopy: true, withCta: false }
    case 'banner_fb': // 820×312
      return { mode: 'horizontal', box: { x: 50, y: 60, w: 720, h: 192 }, logoH: 175, taglineSize: 40, ctaSize: 30, withCopy: true, withCta: false }
    case 'banner_ig': // 1080×1920 vertical story
      return { mode: 'vertical', box: { x: 110, y: 340, w: 860, h: 940 }, logoH: 480, taglineSize: 76, ctaSize: 54, withCopy: true, withCta: false }
    case 'banner_tiktok': // 200×200 — too small for copy
      return { mode: 'logo-only', box: { x: 20, y: 20, w: 160, h: 160 }, logoH: 150, taglineSize: 0, ctaSize: 0, withCopy: false, withCta: false }
    case 'profile_picture': // 1024×1024, circle-cropped
      return { mode: 'logo-only', box: { x: 162, y: 162, w: 700, h: 700 }, logoH: 620, taglineSize: 0, ctaSize: 0, withCopy: false, withCta: false }
    default:
      return { mode: 'horizontal', box: { x: Math.round(W * 0.1), y: Math.round(H * 0.3), w: Math.round(W * 0.8), h: Math.round(H * 0.4) }, logoH: Math.round(H * 0.3), taglineSize: 44, ctaSize: 32, withCopy: true, withCta: false }
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

// Resize to a target WIDTH, preserving aspect ratio.
function resizeToWidth(img: Image, targetW: number): Image {
  if (img.width === targetW) return img
  const scale = targetW / img.width
  img.resize(targetW, Math.max(1, Math.round(img.height * scale)))
  return img
}

// Crop away the transparent margin around a logo so the visible mark fills its
// bounding box (uploaded PNGs often carry heavy padding, which made the logo
// render tiny once fit to a box).
function trimTransparent(img: Image): Image {
  let minX = img.width, minY = img.height, maxX = 1, maxY = 1, found = false
  for (let y = 1; y <= img.height; y++) {
    for (let x = 1; x <= img.width; x++) {
      if ((img.getPixelAt(x, y) & 0xff) > 8) {
        found = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (!found) return img
  const w = maxX - minX + 1, h = maxY - minY + 1
  if (w >= img.width - 2 && h >= img.height - 2) return img
  const pad = Math.round(Math.max(w, h) * 0.02)
  const cx = Math.max(0, minX - 1 - pad), cy = Math.max(0, minY - 1 - pad)
  const cw = Math.min(img.width - cx, w + pad * 2), ch = Math.min(img.height - cy, h + pad * 2)
  return img.clone().crop(cx, cy, cw, ch)
}

// A soft, blurred drop-shadow silhouette of the logo — gentle depth + legibility
// on a photographic scene WITHOUT the hard dark box the old scrim produced.
// Recolor opaque pixels to near-black at reduced alpha, then blur via down/up-scale.
function makeSoftLogoShadow(logo: Image): Image {
  const s = logo.clone()
  for (let y = 1; y <= s.height; y++) {
    for (let x = 1; x <= s.width; x++) {
      const a = s.getPixelAt(x, y) & 0xff
      s.setPixelAt(x, y, a > 12 ? (((6 << 24) | (8 << 16) | (14 << 8) | Math.round(a * 0.5)) >>> 0) : 0)
    }
  }
  const w = s.width, h = s.height
  s.resize(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 7)))
  s.resize(w, h)  // cheap blur
  return s
}

// Render text with a soft dark drop-shadow so it stays legible on any scene
// (no opaque panel needed). Padded to contain the shadow.
async function renderTextShadowed(font: Uint8Array, size: number, text: string, colorHex: string): Promise<Image> {
  const main = await Image.renderText(font, size, text, hexToColor(colorHex, 255))
  const shadow = await Image.renderText(font, size, text, hexToColor('#0A0E14', 190))
  const off = Math.max(2, Math.round(size * 0.08))
  const pad = off + Math.round(size * 0.12)
  const canvas = new Image(main.width + pad * 2, main.height + pad * 2)
  canvas.composite(shadow, pad + off, pad + off)
  canvas.composite(shadow, pad + off + 2, pad + off + 2)
  canvas.composite(main, pad, pad)
  return canvas
}

// Build a stadium-shaped OUTLINE (ghost) CTA: accent border + accent label, no
// fill, so the scenery shows through. Drawn by stamping a filled accent stadium
// then knocking out the interior with a slightly smaller transparent stadium.
async function makeCtaPill(font: Uint8Array, label: string, fontSize: number, accentHex: string, _unusedTextHex: string): Promise<Image> {
  const text = await Image.renderText(font, fontSize, label, hexToColor(accentHex, 255))
  const padX = Math.round(fontSize * 0.9)
  const padY = Math.round(fontSize * 0.55)
  const pillW = text.width + padX * 2
  const pillH = text.height + padY * 2
  const r = Math.floor(pillH / 2)
  const border = Math.max(2, Math.round(fontSize * 0.08))
  const pill = new Image(pillW, pillH)
  const accent = hexToColor(accentHex, 255)
  const clear = 0x00000000
  // Outer stadium in accent.
  pill.drawBox(r + 1, 1, Math.max(1, pillW - 2 * r), pillH, accent)
  pill.drawCircle(r, Math.floor(pillH / 2), r, accent)
  pill.drawCircle(pillW - r, Math.floor(pillH / 2), r, accent)
  // Knock out the interior to leave only a ring of width `border`.
  const ir = Math.max(1, r - border)
  pill.drawBox(r + 1, 1 + border, Math.max(1, pillW - 2 * r), Math.max(1, pillH - 2 * border), clear)
  pill.drawCircle(r, Math.floor(pillH / 2), ir, clear)
  pill.drawCircle(pillW - r, Math.floor(pillH / 2), ir, clear)
  // Center the accent label inside the ring.
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
  // Trim the uploaded logo's transparent padding so it renders at full size.
  const logoImg = trimTransparent(await Image.decode(logo) as Image)

  // Fit the logo within the box, centered, with a soft drop-shadow (no dark box).
  const placeLogo = (targetH: number, availW: number): Image => {
    let lg = resizeToHeight(logoImg, Math.max(24, targetH))
    const capW = Math.round(availW * 0.96)
    if (lg.width > capW) lg = resizeToWidth(lg, capW)
    return lg
  }

  if (layout.mode === 'logo-only') {
    const lg = placeLogo(layout.logoH, box.w)
    const lx = Math.round(box.x + (box.w - lg.width) / 2)
    const ly = Math.round(box.y + (box.h - lg.height) / 2)
    const shOff = Math.max(3, Math.round(lg.height * 0.03))
    bg.composite(makeSoftLogoShadow(lg), lx + shOff, ly + shOff)
    bg.composite(lg, lx, ly)
    return new Uint8Array(await bg.encode())
  }

  // Text covers: the client's EXACT logo (the hero) + a SUBORDINATE URL/tagline,
  // stacked and CENTERED. Never a dark box, never cropped — the logo fills the
  // safe box (minus the small text line) and a soft drop-shadow gives depth.
  const copy = (layout.withCopy && tagline) ? tagline.trim() : ''
  // URL is deliberately smaller than the logo so the logo reads as the hero.
  const urlSize = Math.max(20, Math.min(Math.round(box.h * 0.13), 52))
  let textImg = copy ? await renderTextShadowed(font, urlSize, copy, lightHex) : null
  if (textImg && textImg.width > box.w * 0.98) textImg = resizeToWidth(textImg, Math.round(box.w * 0.98))
  const gap = textImg ? Math.round(urlSize * 0.6) : 0

  const availH = box.h - (textImg ? gap + textImg.height : 0)
  const lg = placeLogo(availH, box.w)   // logo fills the remaining height (the hero)

  const groupH = lg.height + (textImg ? gap + textImg.height : 0)
  const cx = Math.round(W / 2)
  let cy = Math.round(box.y + (box.h - groupH) / 2)

  const shOff = Math.max(3, Math.round(lg.height * 0.03))
  const lgx = Math.round(cx - lg.width / 2)
  bg.composite(makeSoftLogoShadow(lg), lgx + shOff, cy + shOff)
  bg.composite(lg, lgx, cy)
  cy += lg.height + gap
  if (textImg) bg.composite(textImg, Math.round(cx - textImg.width / 2), cy)

  return new Uint8Array(await bg.encode())
}

// Reframe a finished YouTube cover so the ENTIRE design sits inside the centered
// 1546×423 all-device safe strip (nothing is cropped on phone/desktop), with a
// blurred, dimmed copy of the same scene bleeding out to fill the rest of the
// 2560×1440 frame. Deterministic: the fit is by the limiting dimension, so every
// element is guaranteed visible regardless of where the model placed it. This is
// the "resize into the safe zone" step the pipeline runs on banner_yt.
export async function fitToYouTubeSafeZone(coverBytes: Uint8Array): Promise<Uint8Array> {
  const CW = 2560, CH = 1440, SW = 1546, SH = 423
  const SX0 = Math.round((CW - SW) / 2), SY0 = Math.round((CH - SH) / 2)
  const src = await Image.decode(coverBytes) as Image
  const sw = src.width, sh = src.height

  // Backdrop: same scene scaled to COVER the whole canvas, blurred + dimmed.
  const cov = Math.max(CW / sw, CH / sh)
  const bg = src.clone().resize(Math.max(1, Math.round(sw * cov)), Math.max(1, Math.round(sh * cov)))
  bg.crop(Math.max(0, Math.round((bg.width - CW) / 2)), Math.max(0, Math.round((bg.height - CH) / 2)), CW, CH)
  // Cheap blur: downscale hard, then scale back up.
  bg.resize(Math.max(1, Math.round(CW / 24)), Math.max(1, Math.round(CH / 24)))
  bg.resize(CW, CH)
  // Dim ~25% via a translucent black layer (fast — no per-pixel loop).
  const dim = new Image(CW, CH); dim.fill(0x00000040)
  bg.composite(dim, 0, 0)

  // Foreground: the ENTIRE cover fit inside the safe strip, centered.
  const scale = Math.min(SW / sw, SH / sh)
  const fw = Math.max(1, Math.round(sw * scale)), fh = Math.max(1, Math.round(sh * scale))
  const fg = src.clone().resize(fw, fh)
  const X = SX0 + Math.round((SW - fw) / 2), Y = SY0 + Math.round((SH - fh) / 2)

  // Soft drop-shadow so the sharp panel reads as a layer, not a hard cutout.
  const pad = Math.round(Math.max(fw, fh) * 0.03)
  bg.composite(makeScrim(fw + pad * 2, fh + pad * 2, 150, 0.25, 0.25), X - pad, Y - pad + 8)
  bg.composite(fg, X, Y)
  return new Uint8Array(await bg.encode())
}
