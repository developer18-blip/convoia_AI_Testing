import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { CouncilModelResponse } from '../../types'
import { providerBadgeClass } from './councilConstants'

interface Props {
  resp: CouncilModelResponse
}

// Best-effort provider detection from the model's display name.
// Falls back to 'xai' badge style (neutral grey) for unknowns.
function inferProvider(modelName: string): string {
  const n = modelName.toLowerCase()
  if (n.includes('claude')) return 'anthropic'
  if (n.includes('gpt') || n.startsWith('o3') || n.startsWith('o4')) return 'openai'
  if (n.includes('gemini')) return 'google'
  if (n.includes('deepseek')) return 'deepseek'
  if (n.includes('sonar') || n.includes('perplexity')) return 'perplexity'
  if (n.includes('grok')) return 'xai'
  if (n.includes('mistral') || n.includes('codestral')) return 'mistral'
  if (n.includes('llama') || n.includes('mixtral') || n.includes('groq')) return 'groq'
  return 'xai'
}

export function ResponsePanel({ resp }: Props) {
  const [open, setOpen] = useState(false)
  const provider = inferProvider(resp.name)
  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1)

  return (
    <div className={`council-response-panel ${open ? 'council-response-panel--open' : ''}`}>
      <button className="council-response-header" onClick={() => setOpen((v) => !v)}>
        <div className="council-response-name">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{resp.name}</span>
          <span className={`council-provider-badge ${providerBadgeClass(provider)}`}>{providerLabel}</span>
        </div>
        <div className="council-response-meta">
          <span className="council-response-dur">{(resp.durationMs / 1000).toFixed(1)}s</span>
          <span>·</span>
          <span className="council-response-dur">{resp.tokens.toLocaleString()} tok</span>
          <ChevronDown size={13} className="council-response-arrow" />
        </div>
      </button>
      {open && (
        <div className="council-response-body">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{resp.response}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
