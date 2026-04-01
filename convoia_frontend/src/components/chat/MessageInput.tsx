import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { ArrowUp, Plus, Square, X, FileText, Music, Film } from 'lucide-react'
import { VoiceInputButton } from './VoiceInputButton'
import { ImageGenerationModal } from './ImageGenerationModal'

interface AttachedFile {
  file: File
  type: 'image' | 'document' | 'audio' | 'video'
  preview?: string
  extractedText?: string
  transcript?: string
  uploading: boolean
  uploaded: boolean
  error?: string
}

export interface ImageGeneratedData {
  url: string
  prompt: string
}

export interface FileProcessedData {
  userContent: string
  assistantContent: string
  cost: number
  tokens: { input: number; output: number }
  imagePreview?: string
  fileAttachment?: { name: string; type: 'image' | 'document' | 'audio' | 'video'; size: number }
  model?: string
  provider?: string
}

interface MessageInputProps {
  onSend: (content: string) => void
  isLoading: boolean
  disabled?: boolean
  hasActiveSession?: boolean
  estimatedCost?: number
  tokenCount?: number
  selectedModelId?: string
  onStop?: () => void
  onFileProcessed?: (data: FileProcessedData) => void
  onImageGenerated?: (data: ImageGeneratedData) => void
  onSendWithContext?: (text: string, systemContext: string | null, extras?: { fileAttachment?: { name: string; type: 'image' | 'document' | 'audio' | 'video'; size: number }; imagePreview?: string }) => void
  onError?: (message: string) => void
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export function MessageInput({
  onSend,
  isLoading,
  disabled,
  hasActiveSession,
  tokenCount,
  selectedModelId,
  onStop,
  onFileProcessed,
  onImageGenerated,
  onSendWithContext,
  onError,
}: MessageInputProps) {
  const [value, setValue] = useState('')
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [imageGenOpen, setImageGenOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (file: File) => {
    const type: AttachedFile['type'] = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('audio/')
        ? 'audio'
        : file.type.startsWith('video/')
          ? 'video'
          : 'document'

    let preview: string | undefined
    if (type === 'image') {
      preview = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.readAsDataURL(file)
      })
    }

    const attached: AttachedFile = { file, type, preview, uploading: false, uploaded: false }
    setAttachedFile(attached)
    setFileError(null)

    if (type === 'document') preUploadDocument(file)
    if (type === 'audio') preUploadAudio(file)
  }

  const preUploadDocument = async (file: File) => {
    setAttachedFile((prev) => (prev ? { ...prev, uploading: true } : null))
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = localStorage.getItem('convoia_token')
      const res = await fetch(`${API_URL}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (data.success && data.data.extractedText) {
        setAttachedFile((prev) => prev ? { ...prev, uploading: false, uploaded: true, extractedText: data.data.extractedText } : null)
      } else {
        setAttachedFile((prev) => prev ? { ...prev, uploading: false, error: data.message || 'Failed to process document' } : null)
      }
    } catch {
      setAttachedFile((prev) => prev ? { ...prev, uploading: false, error: 'Failed to process document' } : null)
    }
  }

  const preUploadAudio = async (file: File) => {
    setAttachedFile((prev) => (prev ? { ...prev, uploading: true } : null))
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = localStorage.getItem('convoia_token')
      const res = await fetch(`${API_URL}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (data.success && data.data.transcript) {
        setAttachedFile((prev) => prev ? { ...prev, uploading: false, uploaded: true, transcript: data.data.transcript } : null)
      } else {
        setAttachedFile((prev) => prev ? { ...prev, uploading: false, error: 'Failed to transcribe audio' } : null)
      }
    } catch {
      setAttachedFile((prev) => prev ? { ...prev, uploading: false, error: 'Failed to transcribe audio' } : null)
    }
  }

  const handleSend = async () => {
    if (isLoading || fileLoading) return
    setFileError(null)

    if (attachedFile) {
      if (attachedFile.uploading) return
      const currentFile = attachedFile

      if (currentFile.type === 'image') {
        const success = await sendWithImage(value.trim(), currentFile)
        if (!success) return
      } else if (currentFile.type === 'document') {
        await sendWithDocument(value.trim(), currentFile)
        setAttachedFile(null)
      } else if (currentFile.type === 'audio') {
        sendWithAudio(value.trim(), currentFile)
        setAttachedFile(null)
      } else {
        if (value.trim()) onSend(value.trim())
        setAttachedFile(null)
      }

      setValue('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      return
    }

    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  // Detect if the user wants to generate/edit an image (not analyze it)
  const isImageGenIntent = (text: string): boolean => {
    const lower = text.toLowerCase()
    const genPatterns = [
      /generate/i, /create/i, /make\s+(a|an|me|this|the|it)/i, /design/i, /draw/i,
      /similar\s+to/i, /like\s+this/i, /modify/i, /change/i, /edit/i, /transform/i,
      /convert/i, /remake/i, /redo/i, /zoomed/i, /zoom/i, /resize/i, /crop/i,
      /add\s+\w+\s+to/i, /remove\s+\w+\s+from/i, /replace/i, /swap/i,
      /make\s+it/i, /turn\s+(this|it)/i, /improve/i, /enhance/i, /upscale/i,
    ]
    return genPatterns.some((p) => p.test(lower))
  }

  const sendWithImage = async (question: string, attached: AttachedFile): Promise<boolean> => {
    // If the user wants to generate/edit based on this image, send the text
    // through the normal chat flow. The image preview (base64) is passed via
    // onSendWithContext so ChatContext includes it as referenceImage.
    if (question && isImageGenIntent(question)) {
      setAttachedFile(null)
      setFileLoading(false)
      if (onSendWithContext) {
        // Pass image as system context so the backend gets it as referenceImage
        onSendWithContext(
          question,
          null,
          { fileAttachment: { name: attached.file.name, type: 'image', size: attached.file.size }, imagePreview: attached.preview },
        )
      } else {
        onSend(question)
      }
      return true
    }

    setFileLoading(true)
    setFileError(null)
    try {
      const formData = new FormData()
      formData.append('file', attached.file)
      formData.append('prompt', question || 'Analyze this image')
      if (selectedModelId) formData.append('modelId', selectedModelId)

      const token = localStorage.getItem('convoia_token')
      const res = await fetch(`${API_URL}/files/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        const errorMsg = errorData?.message || `Upload failed (${res.status})`
        setFileError(errorMsg)
        onError?.(errorMsg)
        setAttachedFile(attached)
        return false
      }

      const data = await res.json().catch(() => null)
      if (!data || !data.success) {
        const errorMsg = data?.message || 'Image processing failed'
        setFileError(errorMsg)
        onError?.(errorMsg)
        setAttachedFile(attached)
        return false
      }

      const result = data?.data
      if (!result || !result.type) {
        const errorMsg = data?.message || 'Invalid response from server'
        setFileError(errorMsg)
        onError?.(errorMsg)
        setAttachedFile(attached)
        return false
      }

      if (result.type === 'image_analysis') {
        onFileProcessed?.({
          userContent: question || 'Analyze this image',
          assistantContent: result.response || 'Image analyzed successfully.',
          cost: result.cost || 0,
          tokens: { input: result.tokensInput || 0, output: result.tokensOutput || 0 },
          imagePreview: attached.preview,
          fileAttachment: { name: attached.file.name, type: 'image', size: attached.file.size },
          model: result.model,
          provider: result.provider,
        })
        window.dispatchEvent(new Event('wallet:refresh'))
        window.dispatchEvent(new Event('tokens:refresh'))
        setAttachedFile(null)
        return true
      } else {
        setFileError('Unexpected response from server')
        onError?.('Unexpected response from server')
        setAttachedFile(attached)
        return false
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to upload image. Check your connection.'
      setFileError(errorMsg)
      onError?.(errorMsg)
      setAttachedFile(attached)
      return false
    } finally {
      setFileLoading(false)
    }
  }

  const sendWithDocument = async (question: string, attached: AttachedFile) => {
    if (!question) {
      textareaRef.current?.focus()
      return
    }
    if (!attached.extractedText) {
      onSend(question)
      return
    }
    const systemContext =
      `The user has uploaded a document: "${attached.file.name}"\n\n` +
      `Document content:\n${attached.extractedText}\n\n` +
      `Please answer the user's question about this document.`
    const extras = { fileAttachment: { name: attached.file.name, type: 'document' as const, size: attached.file.size } }
    if (onSendWithContext) {
      onSendWithContext(question, systemContext, extras)
    } else {
      onSend(question)
    }
  }

  const sendWithAudio = (question: string, attached: AttachedFile) => {
    if (attached.transcript) {
      const content = question
        ? `${question}\n\nTranscript: ${attached.transcript}`
        : attached.transcript
      if (onSendWithContext) {
        onSendWithContext(content, null, { fileAttachment: { name: attached.file.name, type: 'audio', size: attached.file.size } })
      } else {
        onSend(content)
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-resize textarea — expand as user types, scroll after max
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    // Temporarily shrink to measure true content height
    const prev = el.style.height
    el.style.height = '1px'
    const contentH = el.scrollHeight
    el.style.height = prev // restore immediately to avoid flash
    // Apply: min 56px, grow to content, max 200px, then scroll
    const h = Math.max(56, Math.min(contentH, 200))
    el.style.height = h + 'px'
  }, [value])

  const handleImageGenerated = (imageUrl: string, prompt: string) => {
    onImageGenerated?.({ url: imageUrl, prompt })
    window.dispatchEvent(new Event('wallet:refresh'))
    window.dispatchEvent(new Event('tokens:refresh'))
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    handleFileSelect(file)
    e.target.value = ''
  }

  const estimatedTokens = tokenCount ?? Math.ceil(value.length / 4)
  const canSend = (value.trim() || attachedFile) && !isLoading && !disabled && !fileLoading && !(attachedFile?.uploading)

  return (
    <div className="chat-input-container" style={{ flexShrink: 0, padding: '0 16px 16px', backgroundColor: 'var(--chat-bg)' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>

        {/* Error banner */}
        {fileError && (
          <div className="flex items-center gap-2" style={{ padding: '8px 12px', marginBottom: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', fontSize: '13px', color: '#EF4444' }}>
            <span className="flex-1">{fileError}</span>
            <button onClick={() => setFileError(null)} style={{ color: 'rgba(239,68,68,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Input card */}
        <div className="chat-input-box" style={{
          display: 'flex', flexDirection: 'column',
          backgroundColor: 'var(--chat-input-bg)', borderRadius: '24px',
          border: inputFocused ? '1px solid rgba(124,58,237,0.4)' : '1px solid var(--chat-border)',
          boxShadow: inputFocused
            ? '0 0 0 3px rgba(124,58,237,0.08), 0 4px 16px rgba(0,0,0,0.25)'
            : '0 2px 12px rgba(0,0,0,0.15)',
          transition: 'all 200ms ease',
          cursor: 'text', maxWidth: '100%', overflowX: 'hidden',
        }}
        onClick={() => textareaRef.current?.focus()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation()
          const file = e.dataTransfer.files?.[0]
          if (file && (file.type.startsWith('image/') || file.type.startsWith('audio/') || file.type.includes('pdf') || file.type.includes('document'))) {
            handleFileSelect(file)
          }
        }}
        >

          {/* File preview */}
          {attachedFile && (
            <div style={{ padding: '12px 16px 0' }}>
              {attachedFile.type === 'image' && attachedFile.preview && (
                <div className="relative inline-block">
                  <img src={attachedFile.preview} alt="Attached" style={{ height: '80px', width: 'auto', borderRadius: '10px', border: '1px solid var(--chat-border)', objectFit: 'cover' }} />
                  <button
                    onClick={() => setAttachedFile(null)}
                    className="absolute flex items-center justify-center"
                    style={{ top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--chat-border)', border: '1px solid var(--color-border-hover)', color: 'var(--chat-text-secondary)', cursor: 'pointer' }}
                  >
                    <X size={10} />
                  </button>
                </div>
              )}

              {attachedFile.type === 'document' && (
                <div className="inline-flex items-center gap-2" style={{ background: 'var(--chat-border)', border: '1px solid var(--color-border-hover)', borderRadius: '10px', padding: '6px 12px', fontSize: '13px' }}>
                  <FileText size={14} style={{ color: '#3B82F6' }} />
                  <span className="truncate max-w-48" style={{ color: 'var(--chat-text)' }}>{attachedFile.file.name}</span>
                  <span style={{ color: 'var(--chat-text-muted)', fontSize: '11px' }}>
                    {attachedFile.uploading ? 'Processing...' : attachedFile.uploaded ? 'Ready' : attachedFile.error ? 'Error' : ''}
                  </span>
                  {attachedFile.uploading && <div style={{ width: '12px', height: '12px', border: '1.5px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin-slow 1s linear infinite' }} />}
                  {!attachedFile.uploading && (
                    <button onClick={() => setAttachedFile(null)} style={{ color: 'var(--chat-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={12} /></button>
                  )}
                </div>
              )}

              {attachedFile.type === 'audio' && (
                <div className="inline-flex items-center gap-2" style={{ background: 'var(--chat-border)', border: '1px solid var(--color-border-hover)', borderRadius: '10px', padding: '6px 12px', fontSize: '13px' }}>
                  <Music size={14} style={{ color: '#10B981' }} />
                  <span className="truncate max-w-48" style={{ color: 'var(--chat-text)' }}>{attachedFile.file.name}</span>
                  <span style={{ color: 'var(--chat-text-muted)', fontSize: '11px' }}>
                    {attachedFile.uploading ? 'Transcribing...' : attachedFile.uploaded ? 'Transcribed' : attachedFile.error ? 'Error' : ''}
                  </span>
                  {attachedFile.uploading && <div style={{ width: '12px', height: '12px', border: '1.5px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin-slow 1s linear infinite' }} />}
                  {!attachedFile.uploading && (
                    <button onClick={() => setAttachedFile(null)} style={{ color: 'var(--chat-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={12} /></button>
                  )}
                </div>
              )}

              {attachedFile.type === 'video' && (
                <div className="inline-flex items-center gap-2" style={{ background: 'var(--chat-border)', border: '1px solid var(--color-border-hover)', borderRadius: '10px', padding: '6px 12px', fontSize: '13px' }}>
                  <Film size={14} style={{ color: 'var(--color-primary)' }} />
                  <span className="truncate max-w-48" style={{ color: 'var(--chat-text)' }}>{attachedFile.file.name}</span>
                  <span style={{ color: 'var(--chat-text-muted)', fontSize: '11px' }}>Video (not yet supported)</span>
                  <button onClick={() => setAttachedFile(null)} style={{ color: 'var(--chat-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={12} /></button>
                </div>
              )}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              const items = e.clipboardData?.items
              if (!items) return
              for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                  e.preventDefault()
                  const file = item.getAsFile()
                  if (file) handleFileSelect(file)
                  return
                }
              }
            }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Message ConvoiaAI..."
            rows={1}
            disabled={disabled || fileLoading}
            aria-label="Message input"
            style={{
              width: '100%', backgroundColor: 'transparent', border: 'none', outline: 'none',
              color: 'var(--chat-text)', fontSize: '15px', lineHeight: '1.6', resize: 'none',
              height: '56px', /* controlled by useEffect */
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: '16px 20px 8px', overflowWrap: 'break-word', wordBreak: 'break-word',
              overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--chat-border) transparent',
            }}
          />

          {/* Bottom bar inside pill */}
          <div className="flex items-center justify-between" style={{ padding: '6px 12px 12px' }}>
            {/* Left: Plus button + voice */}
            <div className="flex items-center" style={{ gap: '2px' }}>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,audio/*,video/*"
                onChange={handleFileInputChange}
              />
              <button
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                title="Attach file"
                style={{
                  width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'transparent',
                  border: 'none', color: 'var(--chat-text-muted)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-border)'; e.currentTarget.style.color = 'var(--chat-text)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--chat-text-muted)' }}
              >
                <Plus size={18} />
              </button>
              <VoiceInputButton
                onTranscript={(text) => setValue((prev) => prev + (prev ? ' ' : '') + text)}
                disabled={isLoading || fileLoading}
              />
            </div>

            {/* Right: token count + send/stop */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {value.length > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--chat-text-dim)', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                  ~{estimatedTokens} tokens
                </span>
              )}
              {hasActiveSession && (
                <span style={{ fontSize: '11px', color: 'var(--color-primary)' }}>Session active</span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (isLoading && onStop) {
                    onStop()
                  } else {
                    handleSend()
                  }
                }}
                disabled={!canSend && !isLoading}
                aria-label={isLoading ? 'Stop generation' : 'Send message'}
                style={{
                  width: '38px', height: '38px', borderRadius: '12px', flexShrink: 0,
                  background: isLoading
                    ? 'rgba(239,68,68,0.1)'
                    : canSend
                      ? 'linear-gradient(135deg, #7C3AED, #6D28D9)'
                      : 'var(--chat-surface)',
                  border: isLoading ? '1px solid rgba(239,68,68,0.3)' : canSend ? 'none' : '1px solid var(--chat-border)',
                  cursor: (canSend || isLoading) ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 200ms ease',
                  boxShadow: canSend && !isLoading ? '0 2px 8px rgba(124,58,237,0.4)' : 'none',
                }}
              >
                {isLoading || fileLoading ? (
                  <Square size={14} style={{ color: '#EF4444', fill: '#EF4444' }} />
                ) : (
                  <ArrowUp size={18} style={{ color: canSend ? '#FFFFFF' : 'var(--chat-text-dim)' }} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hint below input */}
      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--chat-text-dim)', marginTop: '8px', opacity: 0.6 }}>
        ConvoiaAI can make mistakes. Check important info.
      </p>

      <ImageGenerationModal
        isOpen={imageGenOpen}
        onClose={() => setImageGenOpen(false)}
        onImageGenerated={handleImageGenerated}
      />
    </div>
  )
}
