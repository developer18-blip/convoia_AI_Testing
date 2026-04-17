import { Fragment, type ReactNode } from 'react'

/**
 * Render the Council verdict text with structural awareness:
 *   - "**Council verdict** — …" first-line prefix
 *   - Insight callouts (lines mentioning "key insight" or "cross-examination")
 *   - Section headers (bold one-liners or short "Title:" lines)
 *   - Bullets with purple dots
 *   - "Recommended next step" green action card
 *   - **bold** inline emphasis
 *   - Streaming cursor
 */
export function renderCouncilVerdict(text: string, isStreaming: boolean): ReactNode {
  const lines = text.split('\n')
  const out: ReactNode[] = []

  const isInsightMarker = (t: string) => {
    const lower = t.toLowerCase()
    return (
      (lower.includes('key') && (lower.includes('insight') || lower.includes('cross-exam'))) ||
      lower.startsWith('the cross-examination surfaced') ||
      lower.startsWith('the cross-exam surfaced') ||
      lower.startsWith('the key insight')
    )
  }

  const isNextStepMarker = (t: string) => {
    const lower = t.toLowerCase()
    return lower.startsWith('recommended next step') ||
           lower.startsWith('**recommended next step') ||
           lower === 'next step:'
  }

  lines.forEach((raw, i) => {
    const line = raw.trim()

    if (!line) {
      out.push(<div key={`sp-${i}`} style={{ height: 6 }} />)
      return
    }

    // Verdict headline
    const verdictMatch = line.match(/^\*?\*?Council verdict\*?\*?\s*[—:–\-]?\s*(.*)$/i)
    if (verdictMatch) {
      const rest = verdictMatch[1] || ''
      out.push(
        <div key={i} className="council-verdict-text">
          <span className="council-verdict-label">Council verdict — </span>
          {parseInline(rest)}
        </div>,
      )
      return
    }

    // Insight callouts
    if (isInsightMarker(line)) {
      const clean = stripMarkdownWrappers(line)
      out.push(<div key={i} className="council-verdict-insight">{parseInline(clean)}</div>)
      return
    }

    // Next step action card
    if (isNextStepMarker(line)) {
      const clean = stripMarkdownWrappers(line).replace(/^[-•]\s*/, '')
      out.push(<div key={i} className="council-verdict-nextstep">{parseInline(clean)}</div>)
      return
    }

    // Section headers: bolded one-liner OR short "Title:" line
    const isBoldHeading = /^\*\*[^*]+\*\*:?$/.test(line)
    const isColonHeading = line.endsWith(':') && line.length < 60 && !line.startsWith('-') && !line.startsWith('•')
    if (isBoldHeading || isColonHeading) {
      const clean = stripMarkdownWrappers(line).replace(/:$/, '')
      out.push(<div key={i} className="council-verdict-section">{clean}</div>)
      return
    }

    // Bullets (dash, asterisk, bullet, or numbered)
    const bulletMatch = line.match(/^(?:[-•*]|\d+\.)\s+(.*)$/)
    if (bulletMatch) {
      out.push(<div key={i} className="council-verdict-bullet">{parseInline(bulletMatch[1])}</div>)
      return
    }

    // Paragraph
    out.push(<div key={i} className="council-verdict-text">{parseInline(line)}</div>)
  })

  if (isStreaming) out.push(<span key="cursor" className="council-verdict-cursor" />)
  return <>{out}</>
}

/** Remove leading/trailing ** wrappers and optional colon suffix. */
function stripMarkdownWrappers(s: string): string {
  return s.replace(/^\*\*(.*?)\*\*$/, '$1').trim()
}

/**
 * Parse inline **bold** markers safely (no dangerouslySetInnerHTML — no XSS risk).
 */
function parseInline(text: string): ReactNode {
  if (!text.includes('**')) return text
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, idx) => {
    const m = p.match(/^\*\*(.+)\*\*$/)
    if (m) return <strong key={idx}>{m[1]}</strong>
    return <Fragment key={idx}>{p}</Fragment>
  })
}
