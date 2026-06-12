// build-video.cjs — generate an HTS promo (16:9) for a given AUDIENCE.
//   AUDIENCE=partner|prospect|client  (default partner)
//   Optional BG_MUSIC=<url>  to mix a background track under the VO.
// Env: ELEVEN_KEY (+ R2_* sourced from haze-social-post/.env).
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('/root/haze-social-post/node_modules/@aws-sdk/client-s3')

const ELEVEN_KEY = process.env.ELEVEN_KEY
const VOICE_ID = process.env.VOICE_ID || 'pNInz6obpgDQGcFmaJgB' // Adam
const AUDIENCE = process.env.AUDIENCE || 'partner'
const BG_MUSIC = process.env.BG_MUSIC || null
const REMOTION = 'http://127.0.0.1:3030'
const HTS = { primary: '#00CFFF', accent: '#FF6B00', background: '#040D1A', text: '#E8F4FF', secondary: '#93A8C0' }
const LOGO = 'https://www.hazetechsolutions.com/favicon.png'

// HTS hero title card — big centered headline that fills the 16:9 frame.
const title = (headerText, bodyText, extra = {}) => ({ template: 'htsTitle', headerText, bodyText, ...extra })
const stat = (headerText, stats, extra = {}) => ({ template: 'stat', headerText, stats, ...extra })
// gpt-image-2 contextual photos (uploaded to R2 by gen-images.cjs).
const IMG = (k) => `https://pub-63148690e7b846428bbe77d952ec92ed.r2.dev/hts-promo/img/${k}.png`
const photo = (key, caption, kenBurns = 'zoomIn') => ({ type: 'image', src: IMG(key), caption, kenBurns })

const SCRIPTS = {
  partner: [
    { text: 'Know business owners who need to grow?', scene: title('PARTNER PROGRAM', 'Send us leads. Get paid when they sign.') },
    { text: 'Your network is full of business owners who need exactly what we do.', scene: photo('rec-share', 'Your network is worth real money') },
    { text: 'Haze Tech Solutions helps them with AI automation, social media marketing, websites, and S E O.', scene: { template: 'checklist', headerText: 'What we do for them', items: [ { text: 'AI Automation', checked: true }, { text: 'Social Media Marketing', checked: true }, { text: 'Website Development', checked: true }, { text: 'SEO & Digital Marketing', checked: true } ] } },
    { text: 'And now you can earn for connecting them with us.', scene: title('HAZE TECH SOLUTIONS', 'Refer businesses. Earn real commission.', { logoUrl: LOGO }) },
    { text: "It's simple. Sign up free, grab your unique referral link, and share it.", scene: { template: 'process', headerText: 'How it works', steps: [ { title: 'Get your link', description: 'Sign up free in seconds' }, { title: 'Share it', description: 'Send it to your network' }, { title: 'Get paid', description: 'When they become a client' } ] } },
    { text: 'When someone you refer becomes a paying client, you earn ten percent of their first invoice. At least fifty dollars, with no cap.', scene: stat('What you earn', [ { value: '10%', label: 'of first invoice' }, { value: '$50', label: 'minimum payout' }, { value: 'No cap', label: 'on referrals' } ], { backgroundImage: IMG('rec-handshake'), statStyle: 'imageOverlay' }) },
    { text: 'No quotas. No cost to join. Just real commission for real introductions.', scene: title('NO CATCH', 'No quotas. No cost to join.') },
    { text: 'Your network is worth something. Start earning today at haze tech solutions dot com slash affiliate.', scene: title('JOIN FREE TODAY', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],
  prospect: [
    { text: 'Trying to grow a business with a small team and even less time?', scene: title('HAZE TECH SOLUTIONS', 'Enterprise-grade growth, built for small business.', { logoUrl: LOGO }) },
    { text: "You're great at running your business. We make it grow.", scene: photo('rec-owner', 'You run it. We grow it.') },
    { text: 'AI automation that runs while you sleep. Social media that grows on autopilot. Websites built to convert. And S E O that gets you found.', scene: { template: 'checklist', headerText: 'What we do', items: [ { text: 'AI Automation', checked: true }, { text: 'Social Media Marketing', checked: true }, { text: 'Website Development', checked: true }, { text: 'SEO & Digital Marketing', checked: true } ] } },
    { text: "We're boutique and hands-on, A-I first, and obsessed with one thing. Results.", scene: title('WHY HAZE', 'Boutique. AI-first. Obsessed with results.') },
    { text: 'Fifty plus businesses trust us, with ninety eight percent satisfaction.', scene: stat('The track record', [ { value: '50+', label: 'clients served' }, { value: '98%', label: 'satisfaction' }, { value: '3 yrs', label: 'experience' } ], { backgroundImage: IMG('rec-team'), statStyle: 'imageOverlay' }) },
    { text: 'See exactly where you are leaving growth on the table. Get your free audit today at haze tech solutions dot com.', scene: title('GET A FREE AUDIT', 'hazetechsolutions.com/free-social-audit', { logoUrl: LOGO }) },
  ],
  client: [
    { text: "You've got momentum. Let's compound it.", scene: title('FOR OUR CLIENTS', "You've got momentum. Let's compound it.", { logoUrl: LOGO }) },
    { text: 'Thank you for trusting us with your growth. Here is how we take it further.', scene: photo('rec-team', 'Let’s take it further, together') },
    { text: 'Automate the busywork. Scale your content. Level up your site. And own your search.', scene: { template: 'checklist', headerText: "What's next", items: [ { text: 'Automate the busywork', checked: true }, { text: 'Scale your content', checked: true }, { text: 'Level up your site', checked: true }, { text: 'Own your search', checked: true } ] } },
    { text: "And here's something new. You can earn while you grow.", scene: title('NEW', 'Earn while you grow.') },
    { text: 'Refer a business to Haze Tech and earn ten percent of their first invoice. At least fifty dollars, with no cap.', scene: stat('Refer & earn', [ { value: '10%', label: 'of first invoice' }, { value: '$50', label: 'minimum' }, { value: 'No cap', label: 'on referrals' } ], { backgroundImage: IMG('rec-share'), statStyle: 'imageOverlay' }) },
    { text: 'Know someone who needs us? Get your referral link at haze tech solutions dot com slash affiliate.', scene: title('REFER & EARN', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],

  // ─── Per-product explainer videos (affiliate knowledge base) ───
  'ai-automation': [
    { text: 'Most businesses lose hours every week to repetitive admin. Haze Tech Solutions automates it away.', scene: title('AI AUTOMATION', 'Work smarter, not harder.') },
    { text: 'Imagine a business where every lead is answered, every call is picked up, and the busywork just handles itself.', scene: photo('ai-assistant', 'Free your team from robot work') },
    { text: 'We audit the busywork, map the ideal workflow, connect their tools with A I, and deploy it to run around the clock.', scene: { template: 'process', headerText: 'How it works', steps: [ { title: 'Audit', description: 'Find the busywork' }, { title: 'Map', description: 'Design the workflow' }, { title: 'Build', description: 'Connect tools + AI' }, { title: 'Run', description: 'Deploy 24/7' } ] } },
    { text: 'Depending on the business, we build an A I assistant that answers customers instantly, an A I call receptionist that never misses a call, marketing automation that nurtures every lead, and a complete A I lead system.', scene: { template: 'checklist', headerText: 'What we build', items: [ { text: 'AI Assistant — instant customer answers', checked: true }, { text: 'AI Call Receptionist — never miss a call', checked: true }, { text: 'Marketing Automation — nurture every lead', checked: true }, { text: 'AI Lead System — capture & qualify 24/7', checked: true } ] } },
    { text: 'Now leads get answered at 2am, reports write themselves, and their team focuses on what actually grows the business.', scene: title('RUNS 24/7', 'Leads answered at 2am. Reports done by morning.') },
    { text: "It's perfect for any business buried in manual work or slow to follow up.", scene: { template: 'checklist', headerText: 'Perfect for', items: [ { text: 'Owners buried in admin', checked: true }, { text: 'Slow lead follow-up', checked: true }, { text: 'Missed calls = missed revenue', checked: true }, { text: 'Repetitive daily tasks', checked: true } ] } },
    { text: 'As a representative example, a local food business automated its lead follow-up and saw three times faster responses and forty percent more bookings in sixty days.', scene: stat('Example outcome', [ { value: '3x', label: 'faster response' }, { value: '+40%', label: 'more bookings' }, { value: '60 days', label: 'to results' } ], { backgroundImage: IMG('ai-cafe'), statStyle: 'imageOverlay' }) },
    { text: 'Custom builds start around twenty-five hundred dollars, and most go live in two to four weeks.', scene: stat('Investment & timeline', [ { value: 'from $2,500', label: 'custom build' }, { value: '2-4 weeks', label: 'to launch' } ]) },
    { text: 'Know a business like that? Refer them and earn at haze tech solutions dot com slash affiliate.', scene: title('REFER & EARN', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],
  'social-media': [
    { text: 'Posting consistently is hard. Haze Tech Solutions does it for them, and makes it convert.', scene: title('SOCIAL MEDIA MARKETING', 'Grow your audience on autopilot.') },
    { text: 'Picture their brand showing up everywhere their customers scroll, consistent, professional, and on autopilot.', scene: photo('sm-phone', 'Show up everywhere they scroll') },
    { text: 'We set the strategy, plan the content, produce the graphics and video, then schedule, post, and engage.', scene: { template: 'process', headerText: 'How it works', steps: [ { title: 'Strategy', description: 'Voice, goals, platforms' }, { title: 'Plan', description: 'A converting calendar' }, { title: 'Produce', description: 'Graphics + video' }, { title: 'Grow', description: 'Post + engage' } ] } },
    { text: "It's a full content team, strategy, design, and growth, for less than the cost of one employee.", scene: title('A WHOLE CONTENT TEAM', 'For less than one hire.') },
    { text: 'Perfect for owners with no time to post, or who post and see nothing back.', scene: { template: 'checklist', headerText: 'Perfect for', items: [ { text: 'No time to post', checked: true }, { text: 'Random posting, no results', checked: true }, { text: 'Wants growth, no team', checked: true }, { text: 'Needs local visibility', checked: true } ] } },
    { text: 'As a representative example, a retail boutique grew from twelve thousand to forty-seven thousand followers in ninety days, with four times the engagement.', scene: stat('Example outcome', [ { value: '12K to 47K', label: 'followers / 90 days' }, { value: '4x', label: 'engagement' } ], { backgroundImage: IMG('sm-boutique'), statStyle: 'imageOverlay' }) },
    { text: 'Plans run from five hundred to two thousand dollars a month, with content live in about a week.', scene: stat('Investment & timeline', [ { value: '$500-$2K', label: 'per month' }, { value: '~1 week', label: 'to first posts' } ]) },
    { text: 'Know a business that needs it? Refer them at haze tech solutions dot com slash affiliate.', scene: title('REFER & EARN', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],
  'website': [
    { text: "A pretty website that doesn't generate leads is just an expense. We build sites that convert.", scene: title('WEBSITE DEVELOPMENT', 'Sites built to convert.') },
    { text: 'A great website is a business’s hardest-working salesperson, turning visitors into leads around the clock.', scene: photo('web-laptop', 'Your hardest-working salesperson') },
    { text: 'We take their brand and goals, generate A I copy on a brand-aligned design, build and deploy, then optimize for leads.', scene: { template: 'process', headerText: 'How it works', steps: [ { title: 'Intake', description: 'Brand, pages, goals' }, { title: 'Generate', description: 'AI copy + design' }, { title: 'Build', description: 'Build + deploy' }, { title: 'Convert', description: 'Optimize for leads' } ] } },
    { text: "It's live in days, not months, at a fraction of what agencies charge, because A I compresses the work.", scene: title('LIVE IN DAYS', 'Not months. A fraction of the cost.') },
    { text: "Perfect for anyone with no site, an outdated one, or a site that just doesn't bring in business.", scene: { template: 'checklist', headerText: 'Perfect for', items: [ { text: 'No site or outdated', checked: true }, { text: 'Looks fine, no leads', checked: true }, { text: 'Quoted months elsewhere', checked: true }, { text: 'Needs to launch fast', checked: true } ] } },
    { text: 'As a representative example, a service business launched a new site in under two weeks and was capturing leads in the very first week.', scene: stat('Example outcome', [ { value: 'under 2 wks', label: 'to launch' }, { value: 'Week 1', label: 'first leads' } ], { backgroundImage: IMG('web-laptop'), statStyle: 'imageOverlay' }) },
    { text: 'Websites range from fifteen hundred to seventy-five hundred dollars, and most go live in days, not months.', scene: stat('Investment & timeline', [ { value: '$1.5K-$7.5K', label: 'one-time' }, { value: 'Days', label: 'not months' } ]) },
    { text: 'Know a business that needs a real website? Refer them at haze tech solutions dot com slash affiliate.', scene: title('REFER & EARN', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],
  'seo': [
    { text: "If a business can't be found on Google, it's invisible. We fix that, and turn searches into leads.", scene: title('SEO & DIGITAL MARKETING', 'Get found. Stay found. Convert.') },
    { text: 'When customers search, you want to be the first business they find, not the last.', scene: photo('seo-search', 'Be the first they find') },
    { text: 'We audit their rankings, optimize on-page and local S E O, amplify with content and paid, then track every lead.', scene: { template: 'process', headerText: 'How it works', steps: [ { title: 'Audit', description: 'Rankings + keywords' }, { title: 'Optimize', description: 'On-page + local' }, { title: 'Amplify', description: 'Content + paid' }, { title: 'Refine', description: 'Track the leads' } ] } },
    { text: 'Now they show up the moment a customer searches for exactly what they sell.', scene: title('SHOW UP FIRST', 'When customers are already searching.') },
    { text: 'Perfect for businesses invisible online or relying only on word of mouth.', scene: { template: 'checklist', headerText: 'Perfect for', items: [ { text: 'Invisible on Google', checked: true }, { text: 'Word-of-mouth only', checked: true }, { text: 'Not in map results', checked: true }, { text: 'Outranked by rivals', checked: true } ] } },
    { text: 'As a representative example, a professional-services firm grew its organic traffic two hundred and ten percent and cut its bounce rate in half within ninety days.', scene: stat('Example outcome', [ { value: '+210%', label: 'organic traffic' }, { value: '-55%', label: 'bounce rate' }, { value: '90 days', label: 'timeframe' } ], { backgroundImage: IMG('seo-storefront'), statStyle: 'imageOverlay' }) },
    { text: 'S E O starts around twelve hundred dollars a month, with early wins in weeks and bigger gains compounding over time.', scene: stat('Investment & timeline', [ { value: 'from $1,200', label: 'per month' }, { value: 'Weeks', label: 'to first wins' } ]) },
    { text: 'Know a business that needs more leads? Refer them at haze tech solutions dot com slash affiliate.', scene: title('REFER & EARN', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],

  // ─── Concept explainers (educational, forwardable to prospects) ───
  'what-is-ai-automation': [
    { text: 'You keep hearing about A I automation. So what actually is it?', scene: title('AI AUTOMATION', 'What is it — and why does it matter?') },
    { text: "Simply put, it's using artificial intelligence to handle the repetitive work that normally ties up a person.", scene: photo('ai-concept', 'A tireless digital employee') },
    { text: 'Think of it as a tireless digital employee that works around the clock, never forgets, and never sleeps.', scene: title('THINK OF IT AS', 'A digital employee that works 24/7.') },
    { text: 'It can be an A I assistant that answers customers instantly, a call receptionist that never misses a call, a lead system that follows up automatically, and workflow bots that handle invoicing, data, and reports.', scene: { template: 'checklist', headerText: 'What it can do', items: [ { text: 'AI Assistant — instant answers', checked: true }, { text: 'AI Call Receptionist — never miss a call', checked: true }, { text: 'Lead system — follow up automatically', checked: true }, { text: 'Workflow bots — invoicing, data, reports', checked: true } ] } },
    { text: 'For a local business, that means every inquiry is answered and every call is captured, even at 2am.', scene: photo('ai-cafe', 'Every lead answered — even at 2am') },
    { text: 'The result? Hours saved every week, no missed leads, lower costs, and instant service that wins customers.', scene: { template: 'checklist', headerText: 'How it helps the business', items: [ { text: 'Save hours every week', checked: true }, { text: 'Never miss a lead or call', checked: true }, { text: 'Cut costs — no extra hires', checked: true }, { text: 'Respond instantly, 24/7', checked: true } ] } },
    { text: "Know a business that's drowning in busywork? Refer them at haze tech solutions dot com slash affiliate.", scene: title('REFER & EARN', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],
  'website-types': [
    { text: 'Not every business needs the same website. The key is building the right one for the goal.', scene: title('WEBSITE DEVELOPMENT', 'What kind of website do you need?') },
    { text: 'We build the right type, from a clean professional presence to a full lead-generating engine.', scene: photo('web-types', 'The right site for the goal') },
    { text: 'Service sites for trades and pros, local sites to get found, portfolios to showcase work, and landing pages and funnels that convert.', scene: { template: 'checklist', headerText: 'Types we build', items: [ { text: 'Service — built to book', checked: true }, { text: 'Local — get found nearby', checked: true }, { text: 'Portfolio — showcase the work', checked: true }, { text: 'Landing & funnels — convert', checked: true } ] } },
    { text: 'Starter from fifteen hundred for a clean presence, Growth at thirty-five hundred for a lead-generating site, and Pro at seventy-five hundred for a full content engine.', scene: stat('Pick your tier', [ { value: 'from $1.5K', label: 'Starter' }, { value: '$3.5K', label: 'Growth' }, { value: '$7.5K', label: 'Pro' } ]) },
    { text: 'Whatever the tier, every site is brand-aligned, mobile-perfect, and built to turn visitors into leads.', scene: photo('web-laptop', 'Your hardest-working salesperson') },
    { text: 'And because A I compresses the work, most go live in days, not months, at a fraction of agency prices.', scene: title('LIVE IN DAYS', 'Not months. A fraction of the cost.') },
    { text: 'Know a business that needs a real website? Refer them at haze tech solutions dot com slash affiliate.', scene: title('REFER & EARN', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],
  'bundles': [
    { text: 'The fastest growth comes from channels working together. That’s what our bundles are built for.', scene: title('BUNDLES', 'Save & scale — two channels, one price.') },
    { text: 'We combine our most popular services at a lower price than buying them separately, all managed by one team.', scene: photo('bundles', 'More growth, for less') },
    { text: 'Social plus S E O at eighteen hundred a month saves four hundred. Website plus social is fourteen thousand for a launch year. And complete is forty thousand a year, fully managed.', scene: stat('The bundles', [ { value: '$1,800/mo', label: 'Social + SEO' }, { value: '$14K/yr', label: 'Website + Social' }, { value: '$40K/yr', label: 'Complete' } ]) },
    { text: 'Channels compound. Content feeds search, search feeds the site, and together they outperform any one alone.', scene: { template: 'checklist', headerText: 'Why bundle', items: [ { text: 'Lower price than buying separately', checked: true }, { text: 'One team, one strategy', checked: true }, { text: 'Channels that compound', checked: true }, { text: 'Faster results, less overhead', checked: true } ] } },
    { text: 'Know a business ready to scale, not just dabble? Refer them at haze tech solutions dot com slash affiliate.', scene: title('REFER & EARN', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],
  'platforms': [
    { text: 'Your customers are scrolling right now. The question is whether your business shows up.', scene: title('PLATFORMS WE MANAGE', 'Everywhere your customers are.') },
    { text: 'We create and manage content across all the major platforms, so a business shows up consistently without juggling ten apps.', scene: photo('platforms', 'Show up everywhere they scroll') },
    { text: 'Instagram for visual reach, TikTok for viral discovery, YouTube for authority, and Facebook for local community.', scene: { template: 'checklist', headerText: 'The big four', items: [ { text: 'Instagram — visual brand + Reels', checked: true }, { text: 'TikTok — short-form discovery', checked: true }, { text: 'YouTube — long-form + Shorts', checked: true }, { text: 'Facebook — local reach', checked: true } ] } },
    { text: 'Plus LinkedIn, X, and Pinterest when they fit. We focus where their customers actually are, not everywhere.', scene: title('THE RIGHT PLATFORMS', 'Not all of them — just the ones that matter.') },
    { text: 'Know a business spread too thin online? Refer them at haze tech solutions dot com slash affiliate.', scene: title('REFER & EARN', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],
  'brand-kit': [
    { text: 'A business only gets one first impression. A consistent brand makes it count.', scene: title('BRAND IDENTITY KITS', 'A complete brand in days.') },
    { text: 'We generate a full brand identity, logos, colors, banners, and a voice guide, so a business looks professional everywhere from day one.', scene: photo('brand-kit', 'Look professional everywhere') },
    { text: 'We discover their vibe, generate logo concepts, they pick a favorite, and we deliver the full kit.', scene: { template: 'process', headerText: 'How it works', steps: [ { title: 'Discover', description: 'Vibe, colors, audience' }, { title: 'Generate', description: 'Logo concepts' }, { title: 'Approve', description: 'Pick your favorite' }, { title: 'Deliver', description: 'Banners, palette, voice' } ] } },
    { text: 'A logo alone is not a brand. It’s the consistency across everything that makes a business look real and trustworthy.', scene: { template: 'checklist', headerText: "What's inside", items: [ { text: 'Logo set — primary, icon, mono', checked: true }, { text: 'Color palette + style', checked: true }, { text: 'Platform banners', checked: true }, { text: 'Voice & tone guide', checked: true } ] } },
    { text: 'Know a business that needs to look the part? Refer them at haze tech solutions dot com slash affiliate.', scene: title('REFER & EARN', 'hazetechsolutions.com/affiliate', { logoUrl: LOGO }) },
  ],
}

const TRANSITIONS = ['crossfade', 'slideLeft', 'crossfade', 'slideLeft', 'zoomIn', 'crossfade', 'slideUp']

async function elevenTTS(text) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`, {
    method: 'POST', headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.15 } }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`)
  return res.json()
}
function wordsFromAlignment(al) {
  const chars = al.characters, st = al.character_start_times_seconds, en = al.character_end_times_seconds
  const words = []; let cur = '', start = null, end = 0
  for (let i = 0; i < chars.length; i++) { const c = chars[i]
    if (c === ' ' || c === '\n') { if (cur) { words.push({ word: cur, start, end }); cur = ''; start = null } }
    else { if (start === null) start = st[i]; cur += c; end = en[i] } }
  if (cur) words.push({ word: cur, start, end }); return words
}
function s3() { return new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } }) }
async function uploadR2(buf, key, ct) { await s3().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET || process.env.R2_BUCKET_NAME, Key: key, Body: buf, ContentType: ct })); return `${process.env.R2_PUBLIC_BASE.replace(/\/$/, '')}/${key}` }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const SEGMENTS = SCRIPTS[AUDIENCE]; if (!SEGMENTS) throw new Error('unknown AUDIENCE ' + AUDIENCE)
  console.log(`[${AUDIENCE}] 1/5 ElevenLabs TTS…`)
  const tts = await elevenTTS(SEGMENTS.map(s => s.text).join(' '))
  const audio = Buffer.from(tts.audio_base64, 'base64')
  const words = wordsFromAlignment(tts.alignment)
  const totalDur = words[words.length - 1].end
  console.log(`   VO ${totalDur.toFixed(1)}s, ${words.length} words`)

  console.log('   2/5 upload VO…')
  const voUrl = await uploadR2(audio, `hts-promo/${AUDIENCE}-vo-${Date.now()}.mp3`, 'audio/mpeg')

  console.log('   3/5 timing scenes…')
  let wi = 0, prevEnd = 0
  const scenes = SEGMENTS.map((seg, i) => {
    const n = seg.text.trim().split(/\s+/).length
    const lastIdx = Math.min(wi + n - 1, words.length - 1)
    const segEnd = (i === SEGMENTS.length - 1) ? totalDur + 0.8 : words[lastIdx].end
    wi = lastIdx + 1
    const duration = Math.max(2.6, +(segEnd - prevEnd).toFixed(2)); prevEnd = segEnd
    return { type: 'graphic', duration, colors: HTS, transition: TRANSITIONS[i % TRANSITIONS.length], ...seg.scene }
  })
  // The Remotion server shortens the video by (n-1)*0.5s of transition overlap;
  // extend the final scene to compensate + a 1s tail so the VO is never cut off.
  const overlap = scenes.length > 1 ? (scenes.length - 1) * 0.5 : 0
  scenes[scenes.length - 1].duration = +(scenes[scenes.length - 1].duration + overlap + 1.0).toFixed(2)
  console.log('   durations:', scenes.map(s => s.duration).join(', '))

  console.log('   4/5 render…')
  const payload = { scenes, voiceOver: voUrl, voiceOverVolume: 1.0, aspectRatio: '16:9' }
  if (BG_MUSIC) { payload.backgroundMusic = BG_MUSIC; payload.backgroundMusicVolume = 0.15 }
  const submit = await fetch(`${REMOTION}/renders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json())
  if (!submit.id) throw new Error('submit failed: ' + JSON.stringify(submit))

  console.log('   5/5 polling job', submit.id)
  let job = null
  for (let i = 0; i < 150; i++) { await sleep(5000)
    const j = await fetch(`${REMOTION}/renders/${submit.id}`).then(r => r.json())
    if (j.status === 'succeeded') { job = j; break }
    if (j.status === 'failed') throw new Error('render failed: ' + j.error)
    if (i % 4 === 0) console.log(`   ${j.status} ${j.progress ?? ''}`)
  }
  if (!job) throw new Error('timeout')
  // job.url is /files/<id>.mp4 — copy from renders dir + upload final to R2.
  const jobId = job.url.split('/').pop().replace('.mp4', '')
  const mp4 = fs.readFileSync(`/root/remotion-server/renders/${jobId}.mp4`)
  const finalUrl = await uploadR2(mp4, `hts-promo/hts-${AUDIENCE}-promo.mp4`, 'video/mp4')
  fs.writeFileSync(`/root/hts-video/${AUDIENCE}.mp4`, mp4)
  console.log(`DONE [${AUDIENCE}]: ${finalUrl}`)
})().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
