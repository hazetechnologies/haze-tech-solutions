// One-shot script: creates 3 internal brand client records + triggers brand kit generation for each.
// Run: node scripts/bootstrap-brand-kits.mjs
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
} catch {}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EDGE_FN_BASE = `${SUPABASE_URL}/functions/v1`

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const BRANDS = [
  {
    name: 'Haze Tech Solutions',
    email: 'brand@hazetechsolutions.com',
    company: 'Haze Tech Solutions',
    product: 'Internal Brand',
    inputs: {
      path: 'cold_start',
      business_name: 'Haze Tech Solutions',
      business_description: 'A full-service web development and digital marketing agency that builds high-performance websites, drives social media growth, and generates leads for growing businesses.',
      industry: 'Digital Agency / Web Development',
      audience: 'Small-to-medium business owners who need a professional website, stronger social media presence, or more online leads',
      vibe: ['premium', 'bold', 'corporate'],
      color_preference: 'Deep navy and electric blue with clean white — professional, trustworthy, modern tech feel',
      inspirations: 'Webflow, Vercel, Linear — clean premium agency aesthetics',
      voice_tone_preference: 'Confident, results-driven, direct — speaks to business owners who want ROI',
    },
  },
  {
    name: 'Haze Clips',
    email: 'brand@hazeclips.com',
    company: 'Haze Clips',
    product: 'Internal Brand',
    inputs: {
      path: 'cold_start',
      business_name: 'Haze Clips',
      business_description: 'A video clipping SaaS that automatically transforms long-form videos into short, engaging clips optimized for TikTok, Instagram Reels, and YouTube Shorts.',
      industry: 'SaaS / Video Technology',
      audience: 'Content creators, YouTubers, podcasters, and brands who want to repurpose long-form content into viral short clips without manual editing',
      vibe: ['bold', 'futuristic', 'edgy'],
      color_preference: 'Electric purple and cyan gradient — vibrant, energetic, creator-focused',
      inspirations: 'Opus Clip, Descript, CapCut — dynamic, creator-first aesthetics',
      voice_tone_preference: 'Energetic, creator-savvy, modern — speaks the language of content creators and growth-focused marketers',
    },
  },
  {
    name: 'Haze Post',
    email: 'brand@hazepost.com',
    company: 'Haze Post',
    product: 'Internal Brand',
    inputs: {
      path: 'cold_start',
      business_name: 'Haze Post',
      business_description: 'An AI-powered platform that automatically generates, schedules, and publishes brand-specific social media content across all major platforms — so businesses grow their audience on autopilot.',
      industry: 'AI SaaS / Social Media Marketing',
      audience: 'Solopreneurs, small businesses, and marketers who want to automate their social media presence with AI-generated, on-brand content',
      vibe: ['futuristic', 'minimalist', 'premium'],
      color_preference: 'Clean white and deep black with gradient accents (electric blue/purple) — smart, AI-forward aesthetic',
      inspirations: 'Notion, Linear, Jasper — clean SaaS aesthetics with a strong AI-forward identity',
      voice_tone_preference: 'Smart, efficient, innovative — positions AI as a competitive advantage that saves time and drives growth',
    },
  },
]

async function run() {
  for (const brand of BRANDS) {
    console.log(`\n── ${brand.name} ──`)

    // 1. Create auth user (ignore if email already exists)
    const pw = `HazeBrand-${randomUUID().slice(0, 8)}!`
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: brand.email,
      password: pw,
      email_confirm: true,
    })
    if (authErr && !authErr.message.includes('already registered')) {
      console.error(`  auth create failed:`, authErr.message)
      continue
    }
    const userId = authData?.user?.id
    console.log(`  auth user: ${userId ?? '(already existed)'}`)

    // 2. Look up existing client or insert new one
    let clientId
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('email', brand.email)
      .maybeSingle()

    if (existing) {
      clientId = existing.id
      console.log(`  client record (existing): ${clientId}`)
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('clients')
        .insert({
          user_id: userId,
          name: brand.name,
          email: brand.email,
          company: brand.company,
          product: brand.product,
        })
        .select('id')
        .single()
      if (insertErr) {
        console.error(`  client insert failed:`, insertErr.message)
        continue
      }
      clientId = inserted.id
      console.log(`  client record created: ${clientId}`)
    }

    // 3. Insert brand_kit row
    const { data: kit, error: kitErr } = await supabase
      .from('brand_kits')
      .insert({ client_id: clientId, status: 'pending', inputs: brand.inputs })
      .select('id')
      .single()
    if (kitErr) {
      console.error(`  brand_kit insert failed:`, kitErr.message)
      continue
    }
    console.log(`  brand_kit row: ${kit.id}`)

    // 4. Invoke edge function (fire-and-forget acknowledged)
    const resp = await fetch(`${EDGE_FN_BASE}/generate-brand-kit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ kit_id: kit.id }),
    })
    const respJson = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      console.error(`  edge function error ${resp.status}:`, respJson)
    } else {
      console.log(`  generation started (status ${resp.status}). Kit ID: ${kit.id}`)
    }
  }

  console.log('\nDone. Poll brand-kit-status/:id or check /admin/clients to monitor progress.')
}

run().catch(console.error)
