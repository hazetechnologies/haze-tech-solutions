// supabase/functions/generate-brand-kit/sizes.ts
import type { ImageAssetId } from './types.ts'

export type GptImageSize = '1024x1024' | '1024x1536' | '1536x1024'

export interface SizeSpec {
  /** What we ask gpt-image-2 to render at. */
  generationSize: GptImageSize
  /** Final dimensions after sharp resize/crop. */
  finalWidth: number
  finalHeight: number
  /** How sharp should fit the generated image into the final dims. */
  fit: 'cover' | 'contain' | 'fill'
}

export const SIZES: Record<ImageAssetId, SizeSpec> = {
  logo_primary:    { generationSize: '1024x1024', finalWidth: 1024, finalHeight: 1024, fit: 'fill' },
  logo_icon:       { generationSize: '1024x1024', finalWidth: 1024, finalHeight: 1024, fit: 'fill' },
  logo_monochrome: { generationSize: '1024x1024', finalWidth: 1024, finalHeight: 1024, fit: 'fill' },
  profile_picture: { generationSize: '1024x1024', finalWidth: 1024, finalHeight: 1024, fit: 'fill' },
  banner_ig:       { generationSize: '1024x1536', finalWidth: 1080, finalHeight: 1920, fit: 'cover' },
  banner_fb:       { generationSize: '1536x1024', finalWidth: 820,  finalHeight: 312,  fit: 'cover' },
  banner_yt:       { generationSize: '1536x1024', finalWidth: 2560, finalHeight: 1440, fit: 'cover' },
  banner_x:        { generationSize: '1536x1024', finalWidth: 1500, finalHeight: 500,  fit: 'cover' },
  banner_tiktok:        { generationSize: '1024x1024', finalWidth: 200,  finalHeight: 200,  fit: 'cover' },
  banner_linkedin_cover:{ generationSize: '1536x1024', finalWidth: 1128, finalHeight: 191,  fit: 'cover' },
}

export const ALL_ASSET_IDS: ImageAssetId[] = Object.keys(SIZES) as ImageAssetId[]
