import type { AIModel } from '../../types'

export const COUNCIL_MODEL_CATEGORIES: Record<string, { label: string; modelIds: string[] }> = {
  recommended: {
    label: 'Recommended',
    modelIds: [
      'claude-opus-4-7',
      'gpt-5.5',
      'gemini-2.5-pro',
    ],
  },
  reasoning: {
    label: 'Reasoning',
    modelIds: [
      'o4-mini',
      'deepseek-reasoner',
      'grok-4.20-0309-reasoning',
    ],
  },
  fast: {
    label: 'Fast & efficient',
    modelIds: [
      'claude-haiku-4-5-20251001',
      'gemini-2.5-flash',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
    ],
  },
  specialized: {
    label: 'Specialized',
    modelIds: [
      'codestral-latest',
      'sonar-deep-research',
      'sonar-pro',
      'mistral-large-latest',
    ],
  },
}

export const RECOMMENDED_IDS = new Set(COUNCIL_MODEL_CATEGORIES.recommended.modelIds)

export const PROVIDER_BADGE_CLASS: Record<string, string> = {
  anthropic: 'council-provider-badge--anthropic',
  openai: 'council-provider-badge--openai',
  google: 'council-provider-badge--google',
  deepseek: 'council-provider-badge--deepseek',
  perplexity: 'council-provider-badge--perplexity',
  xai: 'council-provider-badge--xai',
  mistral: 'council-provider-badge--mistral',
  groq: 'council-provider-badge--openai',
}

export function providerBadgeClass(provider: string | undefined): string {
  if (!provider) return 'council-provider-badge--xai'
  return PROVIDER_BADGE_CLASS[provider.toLowerCase()] || 'council-provider-badge--xai'
}

/**
 * Best-effort provider inference from a model's display name. The council SSE
 * stream only carries display names (e.g. "Claude Opus 4.7"), not model IDs,
 * so the Apollo v2 panel uses this to map to brand-color keys.
 */
export function inferProvider(modelName: string): string {
  const n = modelName.toLowerCase()
  if (n.includes('claude')) return 'anthropic'
  if (n.includes('gpt') || n.startsWith('o3') || n.startsWith('o4')) return 'openai'
  if (n.includes('gemini')) return 'google'
  if (n.includes('deepseek')) return 'deepseek'
  if (n.includes('sonar') || n.includes('perplexity')) return 'perplexity'
  if (n.includes('grok')) return 'xai'
  if (n.includes('mistral') || n.includes('codestral')) return 'mistral'
  if (n.includes('llama') || n.includes('mixtral') || n.includes('groq')) return 'meta'
  return 'default'
}

/**
 * Group a model list into category sections. Uncategorized models go to
 * the end under "Other models". Only returns categories that have at
 * least one matching model from the active list.
 */
export function groupModelsByCategory(activeModels: AIModel[]): Array<{ label: string; models: AIModel[] }> {
  const byModelIdString = new Map<string, AIModel>()
  for (const m of activeModels) byModelIdString.set(m.modelId, m)

  const usedDbIds = new Set<string>()
  const sections: Array<{ label: string; models: AIModel[] }> = []

  for (const cat of Object.values(COUNCIL_MODEL_CATEGORIES)) {
    const models: AIModel[] = []
    for (const mid of cat.modelIds) {
      const m = byModelIdString.get(mid)
      if (m && !usedDbIds.has(m.id)) {
        models.push(m)
        usedDbIds.add(m.id)
      }
    }
    if (models.length > 0) sections.push({ label: cat.label, models })
  }

  // Anything still active that wasn't categorized goes to "Other models"
  const leftovers = activeModels.filter(
    (m) => !usedDbIds.has(m.id) && !m.capabilities?.includes('image_generation'),
  )
  if (leftovers.length > 0) sections.push({ label: 'Other models', models: leftovers })

  return sections
}
