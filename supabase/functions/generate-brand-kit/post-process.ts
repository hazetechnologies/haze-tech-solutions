// supabase/functions/generate-brand-kit/post-process.ts
//
// Uses imagescript (pure JS) instead of sharp because sharp's native binary
// fails to load in the Supabase Deno Edge Runtime.
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts'
import type { SizeSpec } from './sizes.ts'

/** Resize/crop a generated image to its final platform dimensions. */
export async function resizeToFinalDims(input: Uint8Array, spec: SizeSpec): Promise<Uint8Array> {
  const decoded = await Image.decode(input)
  const img = decoded as Image
  const srcW = img.width
  const srcH = img.height
  const dstW = spec.finalWidth
  const dstH = spec.finalHeight

  if (srcW === dstW && srcH === dstH) {
    return new Uint8Array(await img.encode())
  }

  if (spec.fit === 'fill') {
    img.resize(dstW, dstH)
  } else if (spec.fit === 'cover') {
    const scale = Math.max(dstW / srcW, dstH / srcH)
    const scaledW = Math.max(dstW, Math.round(srcW * scale))
    const scaledH = Math.max(dstH, Math.round(srcH * scale))
    img.resize(scaledW, scaledH)
    const cropX = Math.max(0, Math.floor((scaledW - dstW) / 2))
    const cropY = Math.max(0, Math.floor((scaledH - dstH) / 2))
    img.crop(cropX, cropY, dstW, dstH)
  } else {
    // 'contain' — scale down to fit (no padding for v1)
    const scale = Math.min(dstW / srcW, dstH / srcH)
    img.resize(Math.round(srcW * scale), Math.round(srcH * scale))
  }

  return new Uint8Array(await img.encode())
}
