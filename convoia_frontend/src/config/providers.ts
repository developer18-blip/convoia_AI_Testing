export type ProviderKey =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'mistral'
  | 'meta'
  | 'cohere'
  | 'perplexity'
  | 'default'

export interface ProviderTheme {
  name: string
  /** Primary brand color — used in dark mode and as the base */
  primary: string
  /** Darker variant — used in light mode for better contrast */
  primaryLight: string
  /** Soft background tint for accent surfaces */
  soft: string
  /** Border color for accent surfaces */
  border: string
  /** Glow color for focused/hovered accent elements */
  glow: string
  /** Text color to use ON accent backgrounds (white or dark) */
  onAccent: string
}

export const PROVIDER_THEMES: Record<ProviderKey, ProviderTheme> = {
  anthropic: {
    name: 'Anthropic',
    primary: '#D97757',
    primaryLight: '#C15F3C',
    soft: 'rgba(217, 119, 87, 0.1)',
    border: 'rgba(217, 119, 87, 0.3)',
    glow: 'rgba(217, 119, 87, 0.2)',
    onAccent: '#FFFFFF',
  },
  openai: {
    name: 'OpenAI',
    primary: '#10A37F',
    primaryLight: '#0E8C6D',
    soft: 'rgba(16, 163, 127, 0.1)',
    border: 'rgba(16, 163, 127, 0.3)',
    glow: 'rgba(16, 163, 127, 0.2)',
    onAccent: '#FFFFFF',
  },
  google: {
    name: 'Google',
    primary: '#4285F4',
    primaryLight: '#1A73E8',
    soft: 'rgba(66, 133, 244, 0.1)',
    border: 'rgba(66, 133, 244, 0.3)',
    glow: 'rgba(66, 133, 244, 0.2)',
    onAccent: '#FFFFFF',
  },
  xai: {
    name: 'xAI',
    primary: '#A1A1AA',
    primaryLight: '#52525B',
    soft: 'rgba(161, 161, 170, 0.12)',
    border: 'rgba(161, 161, 170, 0.3)',
    glow: 'rgba(161, 161, 170, 0.2)',
    onAccent: '#FFFFFF',
  },
  deepseek: {
    name: 'DeepSeek',
    primary: '#4D6BFE',
    primaryLight: '#3B54D8',
    soft: 'rgba(77, 107, 254, 0.1)',
    border: 'rgba(77, 107, 254, 0.3)',
    glow: 'rgba(77, 107, 254, 0.2)',
    onAccent: '#FFFFFF',
  },
  mistral: {
    name: 'Mistral',
    primary: '#FA520F',
    primaryLight: '#E04A0B',
    soft: 'rgba(250, 82, 15, 0.1)',
    border: 'rgba(250, 82, 15, 0.3)',
    glow: 'rgba(250, 82, 15, 0.2)',
    onAccent: '#FFFFFF',
  },
  meta: {
    name: 'Meta',
    primary: '#0064E0',
    primaryLight: '#0055C2',
    soft: 'rgba(0, 100, 224, 0.1)',
    border: 'rgba(0, 100, 224, 0.3)',
    glow: 'rgba(0, 100, 224, 0.2)',
    onAccent: '#FFFFFF',
  },
  cohere: {
    name: 'Cohere',
    primary: '#FF7759',
    primaryLight: '#E85D40',
    soft: 'rgba(255, 119, 89, 0.1)',
    border: 'rgba(255, 119, 89, 0.3)',
    glow: 'rgba(255, 119, 89, 0.2)',
    onAccent: '#FFFFFF',
  },
  perplexity: {
    name: 'Perplexity',
    primary: '#1FB8CD',
    primaryLight: '#0891B2',
    soft: 'rgba(31, 184, 205, 0.1)',
    border: 'rgba(31, 184, 205, 0.3)',
    glow: 'rgba(31, 184, 205, 0.2)',
    onAccent: '#0A0A0F',
  },
  default: {
    name: 'Intellect',
    primary: '#14B8CD',
    primaryLight: '#0891B2',
    soft: 'rgba(20, 184, 205, 0.1)',
    border: 'rgba(20, 184, 205, 0.3)',
    glow: 'rgba(20, 184, 205, 0.2)',
    onAccent: '#0A0A0F',
  },
}

/**
 * Match a model ID to its provider.
 * Add patterns here as you onboard new models.
 */
export function getProviderFromModelId(modelId: string): ProviderKey {
  if (!modelId) return 'default'
  const id = modelId.toLowerCase()

  if (id.includes('claude') || id.startsWith('anthropic')) return 'anthropic'
  if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4') || id.startsWith('openai')) return 'openai'
  if (id.startsWith('gemini') || id.startsWith('gemma') || id.startsWith('google')) return 'google'
  if (id.startsWith('grok') || id.startsWith('xai')) return 'xai'
  if (id.startsWith('deepseek') || id.includes('deepseek')) return 'deepseek'
  if (id.startsWith('mistral') || id.includes('mixtral') || id.includes('codestral')) return 'mistral'
  if (id.startsWith('llama') || id.startsWith('meta')) return 'meta'
  if (id.startsWith('command') || id.includes('cohere')) return 'cohere'
  if (id.includes('perplexity') || id.startsWith('sonar') || id.startsWith('pplx')) return 'perplexity'

  return 'default'
}

export function getThemeForModel(modelId: string): ProviderTheme {
  return PROVIDER_THEMES[getProviderFromModelId(modelId)]
}
