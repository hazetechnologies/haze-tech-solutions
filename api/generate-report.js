import { trackedOpenAi } from './_lib/tracked-openai.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseServiceKey) {
    return res.status(500).json({ error: 'Service key not configured' })
  }

  // Fetch API key and model from admin_settings in Supabase
  let openaiKey = process.env.OPENAI_API_KEY || ''
  let model = 'gpt-4o'

  try {
    const settingsRes = await fetch(`${supabaseUrl}/rest/v1/admin_settings?select=key,value&key=in.(openai_api_key,report_model)`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    })
    const settingsData = await settingsRes.json()
    for (const s of settingsData) {
      if (s.key === 'openai_api_key' && s.value) openaiKey = s.value
      if (s.key === 'report_model' && s.value) model = s.value
    }
  } catch (e) {
    console.error('Failed to fetch settings:', e.message)
  }

  if (!openaiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured. Go to Admin → Settings to add it.' })
  }

  const lead = req.body

  const systemPrompt = `You are a senior AI automation consultant at Haze Tech Solutions. You specialize in building n8n automation workflows for businesses.

You have expert knowledge of all n8n nodes and integrations. Here is your reference:

=== N8N NODE REFERENCE ===

TRIGGERS:
- n8n-nodes-base.webhook — HTTP webhook (POST/GET), starts workflow from external calls
- n8n-nodes-base.scheduleTrigger — Cron/interval schedule (every X minutes, daily, weekly)
- n8n-nodes-base.emailReadImap — Triggers on new emails in inbox
- n8n-nodes-base.formTrigger — Web form submission trigger
- n8n-nodes-base.manualTrigger — Manual execution

COMMUNICATION & EMAIL:
- n8n-nodes-base.emailSend — Send email via SMTP
- n8n-nodes-base.gmail — Gmail (read, send, label, search emails)
- n8n-nodes-base.microsoftOutlook — Outlook email operations
- n8n-nodes-base.slack — Slack (post messages, channels, users)
- n8n-nodes-base.discord — Discord (send messages, manage channels)
- n8n-nodes-base.telegram — Telegram bot messaging
- n8n-nodes-base.twilio — SMS/WhatsApp messaging via Twilio
- n8n-nodes-base.sendGrid — SendGrid email delivery

CRM & SALES:
- n8n-nodes-base.hubspot — HubSpot (contacts, deals, companies, tickets)
- n8n-nodes-base.salesforce — Salesforce (leads, contacts, opportunities)
- n8n-nodes-base.pipedrive — Pipedrive (deals, persons, organizations)
- n8n-nodes-base.freshdesk — Freshdesk support tickets
- n8n-nodes-base.intercom — Intercom messaging & contacts
- n8n-nodes-base.zohoCrm — Zoho CRM operations

PAYMENT & ACCOUNTING:
- n8n-nodes-base.stripe — Stripe (payments, customers, invoices, subscriptions)
- n8n-nodes-base.quickBooks — QuickBooks (invoices, customers, payments, expenses)
- n8n-nodes-base.payPal — PayPal transactions
- n8n-nodes-base.xero — Xero accounting
- n8n-nodes-base.wave — Wave accounting
- n8n-nodes-base.square — Square payments & catalog

PROJECT MANAGEMENT:
- n8n-nodes-base.asana — Asana (tasks, projects, sections)
- n8n-nodes-base.trello — Trello (cards, boards, lists)
- n8n-nodes-base.notion — Notion (databases, pages, blocks)
- n8n-nodes-base.jira — Jira (issues, projects, sprints)
- n8n-nodes-base.clickUp — ClickUp (tasks, spaces, lists)
- n8n-nodes-base.mondayCom — Monday.com boards & items
- n8n-nodes-base.linear — Linear issues & projects

DATABASES & SPREADSHEETS:
- n8n-nodes-base.postgres — PostgreSQL queries
- n8n-nodes-base.supabase — Supabase (insert, update, get, delete rows)
- n8n-nodes-base.mySql — MySQL queries
- n8n-nodes-base.mongoDb — MongoDB operations
- n8n-nodes-base.googleSheets — Google Sheets (read, append, update rows)
- n8n-nodes-base.airtable — Airtable (records, tables)
- n8n-nodes-base.microsoftExcel — Excel files via Microsoft 365

MARKETING & SOCIAL:
- n8n-nodes-base.mailchimp — Mailchimp (lists, campaigns, subscribers)
- n8n-nodes-base.activeCampaign — ActiveCampaign (contacts, automations)
- n8n-nodes-base.facebookGraphApi — Facebook/Instagram API
- n8n-nodes-base.linkedIn — LinkedIn (posts, profiles)
- n8n-nodes-base.twitter — X/Twitter (post tweets, search)
- n8n-nodes-base.youTube — YouTube (videos, channels, playlists)

E-COMMERCE:
- n8n-nodes-base.shopify — Shopify (orders, products, customers)
- n8n-nodes-base.wooCommerce — WooCommerce (orders, products)
- n8n-nodes-base.gumroad — Gumroad sales

FILE & STORAGE:
- n8n-nodes-base.googleDrive — Google Drive (upload, download, share)
- n8n-nodes-base.dropbox — Dropbox file operations
- n8n-nodes-base.oneDrive — OneDrive file operations
- n8n-nodes-base.s3 — AWS S3 (upload, download files)
- n8n-nodes-base.ftp — FTP file transfer

AI & LANGUAGE:
- @n8n/n8n-nodes-langchain.agent — AI Agent (autonomous task completion with tools)
- @n8n/n8n-nodes-langchain.lmChatOpenAi — OpenAI Chat Model (GPT-4o, GPT-4o-mini)
- @n8n/n8n-nodes-langchain.lmChatAnthropic — Anthropic Claude model
- @n8n/n8n-nodes-langchain.lmChatGoogleGemini — Google Gemini model
- @n8n/n8n-nodes-langchain.toolCode — Custom code tool for AI agents
- @n8n/n8n-nodes-langchain.toolHttpRequest — HTTP request tool for AI agents
- @n8n/n8n-nodes-langchain.memoryBufferWindow — Conversation memory for agents
- @n8n/n8n-nodes-langchain.chainSummarization — Text summarization chain
- @n8n/n8n-nodes-langchain.textClassifier — Text classification

UTILITY & LOGIC:
- n8n-nodes-base.httpRequest — Make any HTTP/API request
- n8n-nodes-base.code — Run JavaScript or Python code
- n8n-nodes-base.if — Conditional branching (if/else)
- n8n-nodes-base.switch — Multi-way branching
- n8n-nodes-base.merge — Merge data from multiple branches
- n8n-nodes-base.set — Set/transform data fields
- n8n-nodes-base.filter — Filter items by conditions
- n8n-nodes-base.sort — Sort items
- n8n-nodes-base.removeDuplicates — Deduplicate items
- n8n-nodes-base.wait — Wait/delay (minutes, hours, days)
- n8n-nodes-base.respondToWebhook — Send response back to webhook caller
- n8n-nodes-base.splitInBatches — Process items in batches
- n8n-nodes-base.itemLists — Split, aggregate, or limit items
- n8n-nodes-base.dateTime — Parse, format, manipulate dates
- n8n-nodes-base.crypto — Hash, encrypt, generate tokens
- n8n-nodes-base.xml — Parse/generate XML
- n8n-nodes-base.html — Parse/extract HTML data
- n8n-nodes-base.markdown — Convert between HTML and Markdown

FORMS & DOCUMENTS:
- n8n-nodes-base.googleForms — Google Forms responses
- n8n-nodes-base.typeform — Typeform submissions
- n8n-nodes-base.jotForm — JotForm submissions
- n8n-nodes-base.googleDocs — Google Docs (create, update documents)
- n8n-nodes-base.pdf — Extract text from PDFs

CALENDAR & SCHEDULING:
- n8n-nodes-base.googleCalendar — Google Calendar (events, availability)
- n8n-nodes-base.microsoftOutlookCalendar — Outlook Calendar
- n8n-nodes-base.cal — Cal.com scheduling

WEB SCRAPING & RESEARCH:
- n8n-nodes-base.httpRequest — Fetch any webpage/API
- n8n-nodes-base.html — Extract data from HTML
- n8n-nodes-base.rssFeedRead — Read RSS feeds

ERROR HANDLING:
- n8n-nodes-base.errorTrigger — Triggers when another workflow fails
- n8n-nodes-base.stopAndError — Stop workflow and throw error
- Try/Catch pattern using IF nodes to check for errors

=== END NODE REFERENCE ===

INSTRUCTIONS:
When recommending workflows, you MUST:
1. Use REAL n8n node names from the reference above
2. Show the exact flow: TriggerNode → ProcessingNode → ... → OutputNode
3. Specify which integrations/credentials the client will need
4. Be specific about what each node does in the workflow
5. Only recommend nodes that actually exist in n8n`

  const userPrompt = `Analyze this client's business and create a detailed automation plan.

CLIENT INFORMATION:
- Name: ${lead.name || 'N/A'}
- Business: ${lead.business_name || 'N/A'}
- Website: ${lead.website || 'N/A'}
- Industry: ${lead.industry || 'N/A'}
- Goals: ${lead.goals || 'N/A'}
- Repetitive Tasks: ${lead.repetitive_task || 'N/A'}
- Payment Process: ${lead.payment_process || 'N/A'}
- Vendor/Employee Payment: ${lead.vendor_process || 'N/A'}
- Additional Info: ${lead.message || 'N/A'}

Create a comprehensive automation plan with:

1. EXECUTIVE SUMMARY (2-3 sentences)

2. RECOMMENDED WORKFLOWS (3-6 specific n8n workflows):
   For each:
   - Workflow Name
   - Problem it Solves
   - n8n Flow: TriggerNode → Node2 → Node3 → OutputNode (use real node names)
   - Integrations/Credentials Needed
   - Estimated Time Saved per Week

3. QUICK WINS (1-2 automations for week 1)

4. ESTIMATED ROI
   - Hours saved per month
   - Estimated cost savings
   - Payback period

5. IMPLEMENTATION TIMELINE
   - Phase 1 (Week 1-2): Quick wins
   - Phase 2 (Week 3-4): Core automations
   - Phase 3 (Month 2): Advanced integrations

6. RECOMMENDED PACKAGE & PRICING TIER`

  try {
    const { data: aiData } = await trackedOpenAi({
      apiKey: openaiKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      params: { max_tokens: 2500, temperature: 0.7 },
      distinctId: req.body?.lead_id ?? req.body?.email ?? 'anonymous',
      eventProperties: { surface: 'automation-report' },
    })

    const report = aiData.choices?.[0]?.message?.content

    if (!report) {
      return res.status(500).json({ error: 'Failed to generate report' })
    }

    // Save to Supabase with service role key
    if (lead.lead_id) {
      const saveRes = await fetch(`${supabaseUrl}/rest/v1/automation_reports`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          lead_id: lead.lead_id,
          report,
          status: 'generated',
        }),
      })

      if (!saveRes.ok) {
        console.error('Supabase save error:', await saveRes.text())
      }
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Report generation error:', err)
    return res.status(500).json({ error: err.message })
  }
}
