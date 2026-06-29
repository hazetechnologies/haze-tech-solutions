// api/_lib/r2.js
// Minimal R2 (S3-compatible) upload helper for the Node api layer. Mirrors the
// edge function's supabase/functions/_shared/r2-upload.ts. Pure key/url builders
// live in r2-keys.js (unit-tested without creds) and are re-exported here.
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { slugifyForKey, buildBlogImageKey, publicUrlFor } from './r2-keys.js'

export { slugifyForKey, buildBlogImageKey, publicUrlFor }

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const BUCKET = process.env.R2_BUCKET || 'haze-tech-brand-kits'
const PUBLIC_URL = process.env.R2_PUBLIC_URL || ''

export function r2Configured() {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && PUBLIC_URL)
}

let _client = null
function client() {
  if (_client) return _client
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  })
  return _client
}

export async function uploadBuffer({ key, body, contentType = 'image/png' }) {
  await client().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }))
  return publicUrlFor(key, PUBLIC_URL)
}
