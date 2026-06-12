// gen-kb.cjs — generate the 4 affiliate knowledge-base brochure HTML files.
// Run locally: node gen-kb.cjs  → writes kb-*.html next to brochure.css.
const fs = require('fs')
const path = require('path')

const IMG = (k) => `https://pub-63148690e7b846428bbe77d952ec92ed.r2.dev/hts-promo/img/${k}.png`

const SERVICES = [
  {
    slug: 'ai-automation', name: 'AI Automation', tagline: 'Work smarter, not harder.', accent: '#00CFFF', img: 'ai-assistant',
    what: 'Custom automated workflows that quietly handle a business’s repetitive work — lead capture, follow-ups, data entry, scheduling, reporting — using AI plus the tools they already use. It runs 24/7 so their team stops doing robot work.',
    steps: [
      { t: 'Audit', d: 'We find the repetitive, time-sucking tasks' },
      { t: 'Map', d: 'Design the ideal automated workflow' },
      { t: 'Build', d: 'Connect their tools + AI, end to end' },
      { t: 'Run', d: 'Deploy, monitor, and refine — 24/7' },
    ],
    who: ['Owners drowning in manual admin', 'Teams repeating the same task daily', 'Service businesses with slow lead follow-up', 'Anyone copy-pasting between apps'],
    pitch: ['If you do a task more than twice a week, we can probably automate it.', 'It runs while you sleep — leads get answered at 2am.', 'We don’t replace your team; we free them for the work that grows the business.'],
    obj: [
      { q: '“Sounds complicated to set up.”', a: 'We build and maintain the whole thing. The client just enjoys the time back.' },
      { q: '“Will it replace my staff?”', a: 'No — it removes the busywork so staff focus on customers and revenue.' },
    ],
  },
  {
    slug: 'social-media', name: 'Social Media Marketing', tagline: 'Grow your audience on autopilot.', accent: '#FF6B00', img: 'sm-phone',
    what: 'Done-for-you, daily branded content and audience growth on the platforms a business’s customers actually use. We handle strategy, creation, scheduling, and engagement — they just show up and grow.',
    steps: [
      { t: 'Strategy', d: 'Brand voice, goals, and target platforms' },
      { t: 'Plan', d: 'A content calendar built to convert' },
      { t: 'Produce', d: 'Graphics, video, and captions — on brand' },
      { t: 'Grow', d: 'Schedule, post, engage, and report' },
    ],
    who: ['Businesses with no time to post consistently', 'Brands that want growth without hiring a team', 'Owners posting randomly with no results', 'Local businesses needing steady visibility'],
    pitch: ['Consistent, professional posting without you lifting a finger.', 'Content built to convert — not just collect likes.', 'A whole content team for less than one hire.'],
    obj: [
      { q: '“I’ve tried agencies and got nothing.”', a: 'We’re boutique and hands-on, and we measure outcomes — reach, leads, conversions — not vanity metrics.' },
      { q: '“I don’t have content to post.”', a: 'We create it all from scratch, on brand, every week.' },
    ],
  },
  {
    slug: 'website', name: 'Website Development', tagline: 'Sites built to convert.', accent: '#A78BFA', img: 'web-laptop',
    what: 'Fast, brand-aligned websites with AI-generated copy, designed to turn visitors into leads — deployed and live in days, not months. Built to perform, not just to look pretty.',
    steps: [
      { t: 'Intake', d: 'Brand, pages, services, and goals' },
      { t: 'Generate', d: 'AI copy on a brand-aligned scaffold' },
      { t: 'Build', d: 'Design, build, and deploy' },
      { t: 'Convert', d: 'Optimize layout + CTAs for leads' },
    ],
    who: ['Businesses with no site — or an outdated one', 'Sites that look fine but generate no leads', 'Owners quoted months and thousands elsewhere', 'New businesses that need to launch fast'],
    pitch: ['Live in days, not months — AI compresses the timeline and the cost.', 'Built to convert visitors into leads, not just to exist.', 'Brand-aligned and mobile-perfect, done for you.'],
    obj: [
      { q: '“Websites are expensive and slow.”', a: 'That’s the old way. Our AI-assisted process cuts both the time and the price dramatically.' },
      { q: '“I already have a website.”', a: 'Does it generate leads? If not, that’s exactly what we fix.' },
    ],
  },
  {
    slug: 'seo', name: 'SEO & Digital Marketing', tagline: 'Get found. Stay found. Convert.', accent: '#22C55E', img: 'seo-storefront',
    what: 'Search, local, and paid marketing working together to put a business in front of customers who are already looking — and turn that attention into qualified leads. One number matters: leads.',
    steps: [
      { t: 'Audit', d: 'Where they rank + keyword opportunities' },
      { t: 'Optimize', d: 'On-page, technical, and local SEO' },
      { t: 'Amplify', d: 'Content + targeted paid campaigns' },
      { t: 'Refine', d: 'Track rankings, traffic, and leads' },
    ],
    who: ['Businesses invisible on Google', 'Owners relying only on word-of-mouth', 'Local shops not showing in map results', 'Anyone whose competitors outrank them'],
    pitch: ['Show up the moment a customer searches for what they sell.', 'Quick wins from local + technical fixes, compounding over time.', 'We report on the only number that matters — qualified leads.'],
    obj: [
      { q: '“SEO takes forever to work.”', a: 'Local and technical fixes drive early wins; the bigger gains compound month over month.' },
      { q: '“I just run ads instead.”', a: 'Ads stop the moment you stop paying. SEO builds an asset that keeps delivering.' },
    ],
  },
  {
    slug: 'what-is-ai-automation', name: 'What Is AI Automation?', tagline: 'A tireless digital employee.', accent: '#00CFFF', img: 'ai-concept',
    what: 'AI automation means using artificial intelligence to handle tasks and workflows automatically — the repetitive, time-consuming work that normally ties up a person. Think of it as a tireless digital employee that works 24/7, never forgets, and never sleeps.',
    steps: [
      { t: 'AI Assistant', d: 'Answers customer questions instantly' },
      { t: 'Call Receptionist', d: 'Picks up, routes & books calls' },
      { t: 'Lead System', d: 'Captures & follows up every lead' },
      { t: 'Workflow Bots', d: 'Invoicing, data entry, reporting' },
    ],
    who: ['Restaurants — reservations & orders', 'Clinics — appointment booking', 'Real estate — instant lead follow-up', 'Trades — missed-call text-back'],
    pitch: ['It works 24/7 — every lead and call answered, even at 2am.', 'It never misses a follow-up, so the business stops leaking revenue.', 'It scales the business without hiring more staff.'],
    obj: [
      { q: '“Is this just chatbots?”', a: 'No — it’s any repetitive task: calls, follow-ups, scheduling, invoicing, reporting and more.' },
      { q: '“Will it feel robotic to my customers?”', a: 'Modern AI is natural and on-brand — most customers can’t tell, and they love the instant response.' },
    ],
  },
  {
    slug: 'website-types', name: 'Types of Websites We Build', tagline: 'The right site for the goal.', accent: '#A78BFA', img: 'web-types',
    what: 'Not every business needs the same website. We build the right type for the goal — from a clean professional presence to a full lead-generating engine — all brand-aligned, mobile-perfect, and live in days.',
    steps: [
      { t: 'Service', d: 'Trades, agencies, pros — built to book' },
      { t: 'Local', d: 'Shops & restaurants — get found locally' },
      { t: 'Portfolio', d: 'Creatives — showcase the work' },
      { t: 'Landing', d: 'Startups & funnels — convert signups' },
    ],
    who: ['Businesses with no site or an outdated one', 'Sites that look fine but get no leads', 'New businesses that need to launch fast', 'Anyone whose site isn’t their best salesperson'],
    pitch: ['Starter — from $1,500: a clean, professional presence.', 'Growth — $3,500: a real working, lead-generating site.', 'Pro — $7,500: a content-heavy lead engine, fully custom.'],
    obj: [
      { q: '“How long does it take?”', a: 'Most sites go live in days, not months — AI compresses the timeline.' },
      { q: '“Will it actually bring in business?”', a: 'Every build is optimized for conversion — clear calls-to-action, fast load, mobile-first.' },
    ],
  },
]

const page = (s) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Haze Tech — ${s.name}</title>
<link rel="stylesheet" href="brochure.css"></head>
<body><div class="page">
  <div class="brand">
    <img src="https://www.hazetechsolutions.com/favicon.png" alt="">
    <div><div class="wm">HAZE <span class="t">TECH</span> SOLUTIONS</div><div class="tag">Partner Knowledge Base</div></div>
  </div>

  <div class="hero" style="background-image:url('${IMG(s.img)}')">
    <div class="ov">
      <span class="kb-badge">Product Guide — for Partners</span>
      <h1>${s.name}<span class="accent" style="color:${s.accent}">${s.tagline}</span></h1>
    </div>
  </div>

  <div class="section"><h2>What it is</h2><p class="lede sm">${s.what}</p></div>

  <div class="section"><h2>How it works</h2>
    <div class="steps">${s.steps.map((st, i) => `<div class="step"><div class="num" style="color:${hex(s.accent, 0.4)}">${i + 1}</div><h3>${st.t}</h3><p>${st.d}</p></div>`).join('')}</div>
  </div>

  <div class="section"><div class="grid cols-2">
    <div class="card who"><h2 style="margin-bottom:10px">Who it’s for</h2><ul class="bul">${s.who.map(w => `<li>${w}</li>`).join('')}</ul></div>
    <div class="pitch"><h2>How to pitch it</h2>${s.pitch.map(p => `<div class="line">${p}</div>`).join('')}</div>
  </div></div>

  <div class="section"><h2>Common objections</h2><div class="obj">${s.obj.map(o => `<div><span class="q">${o.q}</span> <span class="a">— ${o.a}</span></div>`).join('')}</div></div>

  <div class="cta spaced">
    <div><div class="h">Refer a business that needs this.</div><div class="sub">You earn 10% of their first invoice (min $50).</div></div>
    <div class="pill">hazetechsolutions.com/affiliate</div>
  </div>
  <div class="foot"><span>Partner support: info@hazetechsolutions.com</span><span>hazetechsolutions.com</span></div>
</div></body></html>`

function hex(h, a) { h = h.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return `rgba(${r},${g},${b},${a})` }

for (const s of SERVICES) {
  const out = path.join(__dirname, `kb-${s.slug}.html`)
  fs.writeFileSync(out, page(s))
  console.log('wrote', out)
}
