// supabase/functions/generate-brand-kit/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { BrandKitInputs, BrandKitAssets } from './types.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const { kit_id } = await req.json().catch(() => ({}))
  if (!kit_id) {
    return new Response(JSON.stringify({ error: 'kit_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // @ts-ignore EdgeRuntime is a Supabase global
  EdgeRuntime.waitUntil(processBrandKit(kit_id))

  return new Response(JSON.stringify({ ok: true, kit_id }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

async function processBrandKit(kit_id: string): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  async function update(patch: Record<string, unknown>) {
    await supabase.from('brand_kits').update(patch).eq('id', kit_id)
  }

  try {
    const { data: row, error: readErr } = await supabase
      .from('brand_kits')
      .select('inputs, client_id')
      .eq('id', kit_id)
      .single()

    if (readErr || !row) {
      await update({ status: 'failed', error: `row not found: ${readErr?.message}` })
      return
    }

    const inputs = row.inputs as BrandKitInputs
    const client_id = row.client_id as string

    await update({ status: 'generating', progress_message: 'Drafting copy…' })

    // Tasks 7-8 fill this in. For now, simulate a 2-sec delay then mark done with empty assets.
    await new Promise(r => setTimeout(r, 2000))

    const assets: Partial<BrandKitAssets> = {}  // populated in Tasks 7-8
    void inputs; void client_id  // suppress unused warnings until next tasks

    await update({
      status: 'done',
      progress_message: null,
      assets,
    })
  } catch (err) {
    await update({
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
