export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseKey) {
    return res.status(500).json({ error: 'Service key not configured' })
  }

  const { messages, sessionId } = req.body
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages required' })
  }

  // ── Fetch all config from Supabase in parallel ──
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
  }

  let settings = {}, businessInfo = [], faqs = [], triggers = []

  try {
    const [settingsRes, bizRes, faqRes, trigRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/admin_settings?select=key,value`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/business_info?select=*&active=eq.true&order=display_order`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/chatbot_faqs?select=*&active=eq.true`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/automation_triggers?select=*&active=eq.true&trigger_source=eq.chatbot`, { headers }),
    ])

    const settingsData = await settingsRes.json()
    if (Array.isArray(settingsData)) {
      for (const s of settingsData) settings[s.key] = s.value
    }
    businessInfo = await bizRes.json() || []
    faqs = await faqRes.json() || []
    triggers = await trigRes.json() || []
  } catch (e) {
    console.error('Failed to fetch config:', e.message)
  }

  const openaiKey = settings.openai_api_key || process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured. Go to Admin → Settings.' })
  }

  const model = settings.chatbot_model || 'gpt-4o-mini'
  const maxTokens = parseInt(settings.chatbot_max_tokens) || 300
  const personality = settings.chatbot_personality || 'professional'
  const leadCapture = settings.chatbot_lead_capture !== 'false'

  // ── Build system prompt ──
  let systemPrompt = settings.chatbot_system_prompt || 'You are Haze, the friendly AI assistant for Haze Tech Solutions.'

  // Add personality instruction
  const tones = {
    professional: 'Be professional, knowledgeable, and concise.',
    friendly: 'Be warm, friendly, and conversational. Use casual language.',
    casual: 'Be super casual and fun. Use emojis occasionally.',
  }
  systemPrompt += `\n\nTone: ${tones[personality] || tones.professional}`

  // Add business info context
  if (businessInfo.length > 0) {
    systemPrompt += '\n\n=== BUSINESS INFORMATION ===\n'
    for (const info of businessInfo) {
      systemPrompt += `\n[${info.category.toUpperCase()}: ${info.title}]\n${info.content}\n`
    }
  }

  // Add FAQ knowledge
  if (faqs.length > 0) {
    systemPrompt += '\n\n=== FREQUENTLY ASKED QUESTIONS ===\nUse these to answer visitor questions accurately:\n'
    for (const faq of faqs) {
      systemPrompt += `\nQ: ${faq.question}\nA: ${faq.answer}\n`
    }
  }

  // Add trigger awareness
  if (triggers.length > 0) {
    systemPrompt += '\n\n=== AVAILABLE ACTIONS ===\nYou can trigger these actions when visitors request them. When you detect a match, include the exact tag [TRIGGER:trigger_name] in your response (the system will handle the rest):\n'
    for (const t of triggers) {
      systemPrompt += `\n- "${t.name}": Trigger phrases: ${(t.trigger_phrases || []).join(', ')}. ${t.description || ''} → Use tag [TRIGGER:${t.name}]\n`
    }
  }

  // Lead capture instruction
  if (leadCapture) {
    systemPrompt += '\n\nIMPORTANT: Gently guide visitors to share their name and email. When they do, acknowledge warmly and say the team will reach out within 24 hours.'
  }

  systemPrompt += '\n\nKeep responses SHORT (2-3 sentences max). Never use markdown formatting. Write conversationally.'

  // ── Call OpenAI ──
  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10),
        ],
      }),
    })

    const aiData = await aiRes.json()
    let reply = aiData.choices?.[0]?.message?.content || 'Sorry, something went wrong.'

    // ── Check for trigger tags and fire webhooks ──
    const triggerMatch = reply.match(/\[TRIGGER:([^\]]+)\]/g)
    if (triggerMatch) {
      for (const tag of triggerMatch) {
        const triggerName = tag.replace('[TRIGGER:', '').replace(']', '')
        const trigger = triggers.find(t => t.name === triggerName)
        if (trigger && trigger.webhook_url) {
          // Fire the n8n webhook asynchronously
          fetch(trigger.webhook_url, {
            method: trigger.webhook_method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(trigger.webhook_headers || {}),
            },
            body: JSON.stringify({
              trigger: triggerName,
              sessionId,
              messages: messages.slice(-5),
              timestamp: new Date().toISOString(),
            }),
          }).catch(e => console.error(`Trigger ${triggerName} failed:`, e.message))
        }
      }
      // Remove trigger tags from the reply shown to user
      reply = reply.replace(/\[TRIGGER:[^\]]+\]/g, '').trim()
    }

    return res.status(200).json({ reply })
  } catch (err) {
    console.error('Chat error:', err)
    return res.status(500).json({ error: err.message })
  }
}
