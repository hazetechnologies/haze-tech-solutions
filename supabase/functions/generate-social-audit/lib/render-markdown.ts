// supabase/functions/generate-social-audit/lib/render-markdown.ts
import type { AuditReport, PlatformReport } from './types.ts'

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function renderPlatform(name: string, report: PlatformReport): string {
  const lines: string[] = []
  lines.push(`## ${name}\n`)
  lines.push(`**Current state**`)
  lines.push(`- ${fmtNumber(report.current_state.followers)} followers`)
  lines.push(`- ${report.current_state.weekly_posts.toFixed(1)} posts per week`)
  lines.push(`- ${pct(report.current_state.engagement_rate)} engagement rate\n`)

  if (report.competitor_comparison.length > 0) {
    lines.push(`**Competitors**`)
    lines.push(`| Handle | Followers | Weekly posts | Engagement |`)
    lines.push(`|---|---|---|---|`)
    for (const c of report.competitor_comparison) {
      lines.push(`| ${c.handle} | ${fmtNumber(c.followers)} | ${c.weekly_posts.toFixed(1)} | ${pct(c.engagement_rate)} |`)
    }
    lines.push('')
  }

  lines.push(`**What's working**`)
  for (const s of report.content_analysis.strengths) lines.push(`- ${s}`)
  lines.push('')

  lines.push(`**What's not**`)
  for (const w of report.content_analysis.weaknesses) lines.push(`- ${w}`)
  lines.push('')

  lines.push(`**Visual consistency:** ${report.content_analysis.visual_consistency_score}/10\n`)

  lines.push(`**Recommendations**`)
  report.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
  lines.push('')

  return lines.join('\n')
}

export function renderMarkdown(report: AuditReport): string {
  const lines: string[] = []
  lines.push(`# ${report.headline}\n`)
  lines.push(`${report.summary}\n`)

  if (report.platforms.instagram) lines.push(renderPlatform('Instagram', report.platforms.instagram))
  if (report.platforms.youtube) lines.push(renderPlatform('YouTube', report.platforms.youtube))

  lines.push(`## Top recommendations\n`)
  report.top_recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
  lines.push('')

  lines.push(`---\n${report.next_steps_cta}\n`)

  return lines.join('\n')
}
