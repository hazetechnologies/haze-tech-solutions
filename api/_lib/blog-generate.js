// api/_lib/blog-generate.js
// Pure helpers for AI blog-article generation: the Claude prompt builder and a
// tolerant parser for its JSON response. No network — unit-testable.

const LENGTH_WORDS = { short: 500, medium: 1000, long: 1800 }

export function buildBlogPrompt({ topic, keywords = '', tone = 'Professional', length = 'medium', category = '' }) {
  const words = LENGTH_WORDS[length] ?? 1000
  const system = `You are a professional blog writer for Haze Tech Solutions, a web development, AI automation, and digital marketing agency. Write clear, genuinely useful, on-brand articles for a business audience. Return ONLY a single JSON object — no prose, no markdown code fences — with exactly these keys: "title" (string), "excerpt" (string, 1-2 sentences), "content" (clean semantic HTML using ONLY <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <a> tags — no <h1>, no <html>/<head>/<body>, no inline styles, no markdown).`
  const user = `Write a blog article.\nTopic: ${topic}\n${category ? `Category: ${category}\n` : ''}${keywords ? `Keywords to weave in naturally: ${keywords}\n` : ''}Tone: ${tone}\nTarget length: about ${words} words.\nReturn the JSON object only.`
  return { system, user }
}

export function parseBlogGeneration(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty AI response')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found in AI response')
  let obj
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error('AI response was not valid JSON')
  }
  const title = (obj.title ?? '').toString().trim()
  const excerpt = (obj.excerpt ?? '').toString().trim()
  const content = (obj.content ?? '').toString().trim()
  if (!title || !content) throw new Error('AI response missing title or content')
  return { title, excerpt, content }
}
