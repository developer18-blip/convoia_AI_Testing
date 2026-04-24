import { useState, memo } from 'react'
import { Globe } from 'lucide-react'

interface Source {
  title: string
  url: string
  image?: string
  siteName?: string
  snippet?: string
}

interface CitationPillsProps {
  query: string
  sources: Source[]
}

interface CitationPillProps {
  index: number
  source: Source
}

const CitationPill = memo(function CitationPill({ index, source }: CitationPillProps) {
  const [faviconError, setFaviconError] = useState(false)

  let domain = ''
  let faviconValid = false
  try {
    domain = new URL(source.url).hostname.replace(/^www\./, '')
    faviconValid = true
  } catch {
    domain = source.url.slice(0, 40)
  }

  const faviconSrc = faviconValid
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    : ''

  const tooltipTitle = source.title || domain
  const tooltipSnippet = source.snippet
    ? source.snippet.length > 200
      ? source.snippet.slice(0, 200).trim() + '…'
      : source.snippet
    : ''

  return (
    <a
      id={`citation-${index}`}
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="citation-pill"
      aria-label={`Source ${index}: ${tooltipTitle}`}
    >
      <span className="citation-pill__n">[{index}]</span>
      {faviconValid && !faviconError ? (
        <img
          src={faviconSrc}
          width={14}
          height={14}
          alt=""
          className="citation-pill__favicon"
          onError={() => setFaviconError(true)}
          loading="lazy"
        />
      ) : (
        <Globe size={13} strokeWidth={1.5} className="citation-pill__favicon-fallback" aria-hidden="true" />
      )}
      <span className="citation-pill__domain">{domain}</span>
      <div className="citation-pill__tooltip" role="tooltip">
        <div className="citation-pill__tooltip-title">{tooltipTitle}</div>
        {tooltipSnippet && <div className="citation-pill__tooltip-snippet">{tooltipSnippet}</div>}
        <div className="citation-pill__tooltip-url">{domain}</div>
      </div>
    </a>
  )
})

export const CitationPills = memo(function CitationPills({ query, sources }: CitationPillsProps) {
  if (!sources || sources.length === 0) return null

  return (
    <div className="citation-pills grain-surface" role="region" aria-label={`Sources for: ${query}`}>
      <span className="citation-pills__header">
        <span className="citation-pills__icon" aria-hidden="true">🔍</span>
        <span className="citation-pills__count">
          {sources.length} {sources.length === 1 ? 'source' : 'sources'}
        </span>
        <span className="citation-pills__query" title={query}>"{query}"</span>
      </span>
      <div className="citation-pills__row">
        {sources.map((src, i) => (
          <CitationPill key={`${i}-${src.url}`} index={i + 1} source={src} />
        ))}
      </div>
    </div>
  )
})
