export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Chat not configured' })
  }

  const { messages } = req.body
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages required' })
  }

  const systemPrompt = `You are Haze, the friendly AI assistant for Haze Tech Solutions — a digital agency specializing in AI Automation, Social Media Marketing, Website Development, and SEO & Digital Marketing.

Your job is to:
1. Welcome visitors warmly and help them understand our services
2. Answer questions about what we offer, pricing (give ranges, not exact), and process
3. Gently guide interested visitors to share their name, email, and what service they need
4. Be concise, friendly, and professional. Use short responses (2-3 sentences max)

Our services:
- AI Automation ($2,000-5,000): Custom AI workflows, chatbots, lead automation, CRM integration
- Social Media Management ($1,000-2,500/mo): Strategy, content creation, community management, paid ads
- Website Development ($2,500-8,000): Custom React/Next.js sites, e-commerce, landing pages, SEO-optimized
- SEO & Digital Marketing ($800-2,000/mo): On-page SEO, Google Ads, analytics, conversion optimization

We offer Monthly, Quarterly (5% off), 6-Month (10% off), and Annual (15% off) plans.

If someone shares their contact info, acknowledge it warmly and let them know the team will reach out within 24 hours.

Keep responses SHORT. Never use markdown formatting. Don't use bullet points in chat — write conversationally.`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' })
    }

    const reply = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.'
    return res.status(200).json({ reply })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
