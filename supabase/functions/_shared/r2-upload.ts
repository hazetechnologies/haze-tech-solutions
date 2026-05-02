// supabase/functions/_shared/r2-upload.ts
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@^3.700.0'

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!
const ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID')!
const SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')!
const BUCKET = Deno.env.get('R2_BUCKET')!
const PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL')!

let _client: S3Client | null = null
function client(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  })
  return _client
}

export interface UploadResult {
  r2_key: string
  public_url: string
}

export async function uploadImage(opts: {
  bytes: Uint8Array
  clientId: string
  timestamp: string  // e.g. '2026-05-02T14-30-45'
  assetId: string    // e.g. 'logo_primary'
  contentType?: string
}): Promise<UploadResult> {
  const { bytes, clientId, timestamp, assetId, contentType = 'image/png' } = opts
  const key = `brand-kits/${clientId}/${timestamp}/${assetId}.png`
  await client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: bytes,
    ContentType: contentType,
  }))
  return {
    r2_key: key,
    public_url: `${PUBLIC_URL.replace(/\/$/, '')}/${key}`,
  }
}
