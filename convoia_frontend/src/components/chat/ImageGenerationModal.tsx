import { useState } from 'react'
import { Wand2, Download, Copy, X } from 'lucide-react'
import api from '../../lib/api'

interface Props {
  isOpen: boolean
  onClose: () => void
  onImageGenerated: (imageUrl: string, prompt: string) => void
}

export function ImageGenerationModal({ isOpen, onClose, onImageGenerated }: Props) {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState<'1024x1024' | '1792x1024' | '1024x1792'>('1024x1024')
  const [quality, setQuality] = useState<'standard' | 'hd'>('standard')
  const [provider, setProvider] = useState<'gemini' | 'dalle'>('gemini')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    imageUrl: string
    revisedPrompt: string
    provider?: string
    tokensUsed?: number
  } | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await api.post('/files/generate-image', { prompt, size, quality, provider })
      setResult(res.data.data)
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } }
      setError(apiErr.response?.data?.message ?? 'Image generation failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleUseInChat = () => {
    if (result) {
      onImageGenerated(result.imageUrl, prompt)
      onClose()
      setPrompt('')
      setResult(null)
    }
  }

  const handleDownload = () => {
    if (!result) return
    const link = document.createElement('a')
    link.href = result.imageUrl
    link.download = 'convoia-generated-image.png'
    link.target = '_blank'
    link.click()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 size={20} className="text-primary" />
            <h2 className="text-white font-semibold">Generate Image</h2>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Prompt */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              Describe the image you want
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A futuristic city at sunset with flying cars and neon lights..."
              rows={3}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-white placeholder:text-text-muted text-sm resize-none focus:outline-none focus:border-primary"
            />
          </div>

          {/* Size */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">Size</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: '1024x1024', label: 'Square', desc: '1:1' },
                { value: '1792x1024', label: 'Landscape', desc: '16:9' },
                { value: '1024x1792', label: 'Portrait', desc: '9:16' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSize(opt.value)}
                  className={`py-2 px-3 rounded-lg border text-sm transition-colors text-left ${
                    size === opt.value
                      ? 'border-primary bg-primary/10 text-white'
                      : 'border-border text-text-secondary hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-text-muted">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">AI Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'gemini' as const, label: 'Gemini Flash', tokens: '500', desc: 'Fast, free tier, 1500/day', color: '#4285F4' },
                { value: 'dalle' as const, label: 'DALL-E 3', tokens: '1,000', desc: 'Photorealistic, HD option', color: '#10A37F' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setProvider(opt.value)}
                  className={`py-2 px-3 rounded-lg border text-sm transition-colors text-left ${
                    provider === opt.value
                      ? 'border-primary bg-primary/10 text-white'
                      : 'border-border text-text-secondary hover:border-primary/50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{opt.label}</span>
                    <span style={{ color: opt.color, fontSize: '11px' }}>{opt.tokens} tokens</span>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Quality (only for DALL-E) */}
          {provider === 'dalle' && (
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Quality</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'standard' as const, label: 'Standard', desc: 'Good quality, faster' },
                  { value: 'hd' as const, label: 'HD', desc: 'Higher detail, slower' },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setQuality(opt.value)}
                    className={`py-2 px-3 rounded-lg border text-sm transition-colors text-left ${
                      quality === opt.value
                        ? 'border-primary bg-primary/10 text-white'
                        : 'border-border text-text-secondary hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-text-muted mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Token cost preview */}
          <div className="bg-surface-2 rounded-lg p-3 flex justify-between items-center">
            <span className="text-text-secondary text-sm">Token cost</span>
            <span className="text-white font-mono font-medium">{provider === 'gemini' ? '500' : '1,000'} tokens</span>
          </div>

          {/* Error */}
          {error && <p className="text-danger text-sm">{error}</p>}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating... (10-30 seconds)
              </>
            ) : (
              <>
                <Wand2 size={16} />
                Generate Image
              </>
            )}
          </button>

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden border border-border">
                <img src={result.imageUrl} alt={prompt} className="w-full" />
              </div>

              {/* Provider badge + revised prompt */}
              <div className="bg-surface-2 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                    backgroundColor: result.provider?.includes('Gemini') ? '#4285F420' : '#10A37F20',
                    color: result.provider?.includes('Gemini') ? '#4285F4' : '#10A37F',
                  }}>
                    {result.provider || 'Gemini Flash'}
                  </span>
                  {result.tokensUsed && (
                    <span className="text-xs text-text-muted">{result.tokensUsed} tokens used</span>
                  )}
                </div>
                {result.revisedPrompt !== prompt && (
                  <p className="text-sm text-text-secondary mt-1">{result.revisedPrompt}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownload}
                  className="py-2 rounded-lg border border-border text-text-secondary hover:text-white hover:border-primary/50 transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <Download size={14} />
                  Download
                </button>
                <button
                  onClick={handleUseInChat}
                  className="py-2 rounded-lg bg-primary hover:bg-primary-hover text-white transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <Copy size={14} />
                  Use in Chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
