// supabase/functions/generate-brand-kit/post-process.ts
import sharp from 'npm:sharp@^0.33.0'
import type { SizeSpec } from './sizes.ts'

/** Resize/crop a generated image to its final platform dimensions. */
export async function resizeToFinalDims(input: Uint8Array, spec: SizeSpec): Promise<Uint8Array> {
  // If already at final dims, no-op (saves work for square assets).
  const meta = await sharp(input).metadata()
  if (meta.width === spec.finalWidth && meta.height === spec.finalHeight) {
    return input
  }
  const out = await sharp(input)
    .resize(spec.finalWidth, spec.finalHeight, { fit: spec.fit })
    .png()
    .toBuffer()
  return new Uint8Array(out)
}
