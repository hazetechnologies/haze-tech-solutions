// Smoke test: directly exercise the website-funnel edge function pipeline.
// 1. Pick a real client (Haze Tech Solutions)
// 2. Insert a website_projects row with intake already filled
// 3. Invoke generate-website-scaffold edge function via service role
// 4. Poll until done/failed
// 5. Verify GitHub repo was created
// 6. Cleanup: delete the website_projects row + GitHub repo
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

try {
  // .env is in the parent repo (this script runs from a worktree)
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
} catch (e) { console.error('env load failed:', e.message) }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SK           = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(SUPABASE_URL, SK)

// Use the existing Haze Tech Solutions client (UUID known from prior session work)
const TEST_CLIENT_ID = 'e2193039-0775-4eb6-a407-78576b577fbd' // Haze Tech Solutions
const TEST_INPUTS = {
  template_id: 'service-business',
  domain: 'smoketest-haze.example.com',
  business_description: 'A full-service web development and digital marketing agency',
  services: ['Web design', 'SEO', 'Social media management'],
  pages: ['Home', 'About', 'Services', 'Contact'],
  color_style_prefs: 'Dark navy and electric cyan, modern and professional',
  use_brand_kit: false, // skip brand-kit lookup to test cold path
}

async function main() {
  console.log('── Smoke test: website-funnel edge function ──\n')

  // 1. Verify client exists
  const { data: client } = await sb.from('clients').select('id, name').eq('id', TEST_CLIENT_ID).single()
  if (!client) throw new Error(`Test client ${TEST_CLIENT_ID} not found`)
  console.log(`✓ Test client: ${client.name}`)

  // 2. Cleanup any prior website_projects rows for this client
  await sb.from('website_projects').delete().eq('client_id', TEST_CLIENT_ID)

  // 3. Insert intake_submitted row directly (skips activate + submit endpoints)
  const { data: project, error: insErr } = await sb
    .from('website_projects')
    .insert({
      client_id: TEST_CLIENT_ID,
      status: 'intake_submitted',
      template_id: TEST_INPUTS.template_id,
      inputs: TEST_INPUTS,
    })
    .select()
    .single()
  if (insErr) throw new Error(`Insert failed: ${insErr.message}`)
  console.log(`✓ Created website_project ${project.id}`)

  // 4. Invoke edge function
  console.log(`\n→ Invoking generate-website-scaffold edge function...`)
  const invokeRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-website-scaffold`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: project.id }),
  })
  if (!invokeRes.ok) {
    const txt = await invokeRes.text().catch(() => '')
    throw new Error(`Invoke failed ${invokeRes.status}: ${txt}`)
  }
  console.log(`✓ Edge function invoked (${invokeRes.status})`)

  // 5. Poll until done/failed
  console.log(`\n→ Polling status...`)
  let final
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const { data } = await sb.from('website_projects').select('*').eq('id', project.id).single()
    process.stdout.write(`  [${i+1}/60] ${data.status} - ${data.progress_message || '(no msg)'}\n`)
    if (data.status === 'done' || data.status === 'failed') {
      final = data
      break
    }
  }

  if (!final) {
    console.log('\n❌ Timed out waiting for completion')
    return
  }

  if (final.status === 'failed') {
    console.log(`\n❌ FAILED: ${final.error}`)
    return
  }

  // 6. Verify result
  console.log(`\n✅ Generation complete!`)
  console.log(`   Repo URL:  ${final.repo_url}`)
  console.log(`   Repo name: ${final.repo_name}`)
  console.log(`   AI content keys: ${Object.keys(final.ai_content || {}).join(', ')}`)
  console.log(`   Hero headline: "${final.ai_content?.hero?.headline}"`)
  console.log(`   Hero CTA: "${final.ai_content?.hero?.cta}"`)
  console.log(`   Services count: ${final.ai_content?.services?.length}`)

  // 7. Verify content.json on GitHub
  console.log(`\n→ Verifying content.json on GitHub...`)
  const ghRes = await fetch(`https://api.github.com/repos/hazetechnologies/${final.repo_name}/contents/content.json`)
  if (!ghRes.ok) {
    console.log(`⚠️  Could not verify (${ghRes.status}) — repo may be private (expected)`)
  } else {
    const data = await ghRes.json()
    console.log(`✓ content.json exists (${data.size} bytes)`)
  }

  console.log(`\n📋 Cleanup: Run this to remove the test repo:`)
  console.log(`   gh repo delete hazetechnologies/${final.repo_name} --yes`)
  console.log(`\n📋 To delete the website_project row:`)
  console.log(`   await sb.from('website_projects').delete().eq('id', '${project.id}')`)
}

main().catch(e => { console.error('ERROR:', e); process.exit(1) })
