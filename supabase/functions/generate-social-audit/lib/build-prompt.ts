// supabase/functions/generate-social-audit/lib/build-prompt.ts
import type { AuditInputs, RawData, FetchedPost } from './types.ts'
import { selectPosts } from './select-posts.ts'

export const REPORT_JSON_SCHEMA = {
  name: 'audit_report',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'summary', 'platforms', 'top_recommendations', 'next_steps_cta'],
    properties: {
      headline: { type: 'string' },
      summary: { type: 'string' },
      platforms: {
        type: 'object',
        additionalProperties: false,
        properties: {
          instagram: { $ref: '#/$defs/platformReport' },
          youtube:   { $ref: '#/$defs/platformReport' },
        }
      },
      top_recommendations: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 10 },
      next_steps_cta: { type: 'string' },
    },
    $defs: {
      platformReport: {
        type: 'object',
        additionalProperties: false,
        required: ['current_state', 'competitor_comparison', 'content_analysis', 'recommendations'],
        properties: {
          current_state: {
            type: 'object', additionalProperties: false,
            required: ['followers', 'weekly_posts', 'engagement_rate'],
            properties: {
              followers: { type: 'integer' },
              weekly_posts: { type: 'number' },
              engagement_rate: { type: 'number' },
            }
          },
          competitor_comparison: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['handle', 'followers', 'weekly_posts', 'engagement_rate'],
              properties: {
                handle: { type: 'string' },
                followers: { type: 'integer' },
                weekly_posts: { type: 'number' },
                engagement_rate: { type: 'number' },
              }
            }
          },
          content_analysis: {
            type: 'object', additionalProperties: false,
            required: ['strengths', 'weaknesses', 'visual_consistency_score'],
            properties: {
              strengths: { type: 'array', items: { type: 'string' } },
              weaknesses: { type: 'array', items: { type: 'string' } },
              visual_consistency_score: { type: 'integer', minimum: 1, maximum: 10 },
            }
          },
          recommendations: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
}

const SYSTEM_PROMPT = (inputs: AuditInputs) => `You are a senior social media strategist conducting an audit.
The brand's audience: ${inputs.audience}
Their primary goal: ${inputs.goal}
Their biggest challenge right now: ${inputs.challenge}

You will be given:
- Their current stats and recent posts on Instagram and/or YouTube
- Up to 2 competitor handles per platform with the same data
- Thumbnails of their (and competitors') top-performing and most-recent posts

Your job:
1. Compute current_state metrics:
   - followers = followers_count
   - weekly_posts = posts in last 90 days / 12.86 (rounded to 1 decimal)
   - engagement_rate = avg((likes + comments) / followers) over last 20 posts (decimal, e.g. 0.034 = 3.4%)
2. Build competitor_comparison entries with the same metrics for each competitor handle.
3. Analyze content quality based on the images you see and the captions provided. Score visual_consistency 1-10 where 10 = highly cohesive brand aesthetic.
4. Reference SPECIFIC posts when listing strengths/weaknesses. Don't be generic.
5. For recommendations, identify gaps where competitors do something the brand doesn't (e.g. "Competitor @x posts Reels 4x/week, you post 0").
6. Compile 5-7 prioritized top_recommendations across all platforms.
7. End with a compelling next_steps_cta urging the reader to engage Haze Tech to execute the plan.

Output JSON only, matching the provided schema.

If a platform has unavailable handles (personal account, not found, API error), note it in the report and skip that platform's section if no data was retrieved.`

export function buildPrompt(inputs: AuditInputs, raw: RawData): {
  systemPrompt: string
  userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
} {
  const userText = JSON.stringify({ inputs, raw_data: raw }, null, 2)
  const imageUrls: string[] = []

  for (const platformKey of ['instagram', 'youtube'] as const) {
    const platform = raw[platformKey]
    if (!platform) continue
    for (const handle of [platform.self, ...platform.competitors].filter(Boolean) as Array<NonNullable<typeof platform.self>>) {
      if (!handle.available) continue
      const top10 = selectPosts(handle.posts)
      for (const p of top10) {
        const url = p.thumbnail_url ?? p.media_url
        if (url) imageUrls.push(url)
      }
    }
  }

  const userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: userText }
  ]
  for (const url of imageUrls) {
    userContent.push({ type: 'image_url', image_url: { url } })
  }

  return { systemPrompt: SYSTEM_PROMPT(inputs), userContent }
}
