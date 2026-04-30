// supabase/functions/generate-social-audit/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { audit_id } = await req.json().catch(() => ({}))
  if (!audit_id) {
    return new Response(JSON.stringify({ error: 'audit_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // TODO: replaced in Task 9 with real orchestration
  await supabase.from('social_audits')
    .update({ status: 'completed', progress_message: 'stub' })
    .eq('id', audit_id)

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
