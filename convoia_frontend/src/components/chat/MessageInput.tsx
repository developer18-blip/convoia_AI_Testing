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
  onSendWithContext?: (text: string, systemContext: string | null, extras?: { fileAttachment?: { name: string; type: 'image' | 'document' | 'audio' | 'video'; size: number }; imagePreview?: string; imagePreviews?: string[] }) => void
  onError?: (message: string) => void
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export function MessageInput({
  onSend,
  isLoading,
  disabled,
  hasActiveSession,
  tokenCount,
  selectedModelId: _selectedModelId,
  onStop,
  onFileProcessed: _onFileProcessed,
  onImageGenerated,
  onSendWithContext,
  onError: _onError,
}: MessageInputProps) {
  void _selectedModelId; void _onFileProcessed; void _onError;
  const [value, setValue] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [fileLoading, _setFileLoading] = useState(false); void _setFileLoading;
  const [fileError, setFileError] = useState<string | null>(null)
  const [imageGenOpen, setImageGenOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (file: File) => {
    // Limit to 5 files max
    if (attachedFiles.length >= 5) {
      setFileError('Maximum 5 files at once')
      return
    }

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
    setAttachedFiles(prev => [...prev, attached])
    setFileError(null)

    if (type === 'document') preUploadDocumentAtIndex(file, attachedFiles.length)
    if (type === 'audio') preUploadAudioAtIndex(file, attachedFiles.length)
  }

  const preUploadDocumentAtIndex = async (file: File, idx: number) => {
    setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: true } : f))
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
      console.log('[PDF Upload] Response:', { success: data.success, textLength: data.data?.extractedText?.length, warning: data.data?.warning })
      if (data.success && data.data?.extractedText) {
        setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, uploaded: true, extractedText: data.data.extractedText } : f))
      } else {
        setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: data.data?.warning || data.message || 'Failed to process' } : f))
      }
    } catch {
      setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: 'Failed to process' } : f))
    }
  }

  const preUploadAudioAtIndex = async (file: File, idx: number) => {
    setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: true } : f))
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
        setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, uploaded: true, transcript: data.data.transcript } : f))
      } else {
        setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: 'Transcription failed' } : f))
      }
    } catch {
      setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: 'Transcription failed' } : f))
    }
  }

  const removeFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSend = async () => {
    if (isLoading || fileLoading) return
    if (attachedFiles.some(f => f.uploading)) return
    setFileError(null)

    if (attachedFiles.length > 0) {
      const images = attachedFiles.filter(f => f.type === 'image')
      const docs = attachedFiles.filter(f => f.type === 'document')
      const audios = attachedFiles.filter(f => f.type === 'audio')

      // ── UNIFIED MULTI-FILE PATH ──
      // ALL file combinations go through one path: images as base64, docs/audio as text context
      const contextParts: string[] = []
      const allImagePreviews: string[] = []

      // Collect document text
      for (const doc of docs) {
        if (doc.extractedText) contextParts.push(`[Document: ${doc.file.name}]\n${doc.extractedText}`)
      }

      // Collect audio transcripts
      for (const audio of audios) {
        if (audio.transcript) contextParts.push(`[Audio transcript: ${audio.file.name}]\n${audio.transcript}`)
      }

      // Collect image previews (base64)
      for (const img of images) {
        if (img.preview) allImagePreviews.push(img.preview)
      }

      // Build the message
      const combinedContext = contextParts.length > 0 ? contextParts.join('\n\n---\n\n') : null
      const totalFiles = images.length + docs.length + audios.length
      const defaultQuestion = totalFiles > 1
        ? `Analyze these ${totalFiles} files`
        : images.length === 1 ? 'Analyze this image'
        : docs.length === 1 ? 'Analyze this document'
        : 'Analyze this file'
      const question = value.trim() || defaultQuestion

      // Build file attachment info
      const allFileNames = attachedFiles.map(f => f.file.name).join(', ')
      const totalSize = attachedFiles.reduce((s, f) => s + f.file.size, 0)
      const primaryType = images.length > 0 ? 'image' as const : 'document' as const

      if (onSendWithContext) {
        // Multi-file instruction for the model
        const multiFileInstruction = totalFiles > 1
          ? `\n\n[${totalFiles} files attached: ${images.length > 0 ? `${images.length} image(s)` : ''}${docs.length > 0 ? `${images.length > 0 ? ', ' : ''}${docs.length} document(s)` : ''}${audios.length > 0 ? `${(images.length + docs.length) > 0 ? ', ' : ''}${audios.length} audio file(s)` : ''}. Analyze ALL files together — compare, summarize, and find connections between them.]`
          : ''

        onSendWithContext(
          combinedContext ? `${question}${multiFileInstruction}\n\n${combinedContext}` : `${question}${multiFileInstruction}`,
          null,
          {
            fileAttachment: { name: allFileNames, type: primaryType, size: totalSize },
            imagePreview: allImagePreviews[0],
            imagePreviews: allImagePreviews.length > 1 ? allImagePreviews : undefined,
          },
        )
      } else if (combinedContext) {
        onSend(`${question}\n\n${combinedContext}`)
      } else if (value.trim()) {
        onSend(value.trim())
      }

      setValue('')
      setAttachedFiles([])
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      return
    }

    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
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
    const files = e.target.files
    if (!files || files.length === 0) return
    Array.from(files).forEach(f => handleFileSelect(f))
    e.target.value = ''
  }

  const estimatedTokens = tokenCount ?? Math.ceil(value.length / 4)
  const anyUploading = attachedFiles.some(f => f.uploading)
  const canSend = (value.trim() || attachedFiles.length > 0) && !isLoading && !disabled && !fileLoading && !anyUploading

  return (
    <div className="chat-input-container" style={{ flexShrink: 0, padding: '0 16px 16px', backgroundColor: 'var(--chat-bg)' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>

        {/* Error banner */}
        {fileError && (
          <div className="flex items-center gap-2 error-banner-enter" role="alert" style={{ padding: '8px 14px', marginBottom: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', fontSize: '13px', color: 'var(--color-danger)' }}>
            <span className="flex-1">{fileError}</span>
            <button onClick={() => setFileError(null)} style={{ color: 'rgba(239,68,68,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', borderRadius: '4px', transition: 'color 150ms' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-danger)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(239,68,68,0.5)'}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Input card */}
        <div className="chat-input-box" style={{
          display: 'flex', flexDirection: 'column',
          backgroundColor: 'var(--chat-input-bg)', borderRadius: '24px',
          border: inputFocused ? '1px solid var(--color-primary)' : '1px solid var(--chat-border)',
          boxShadow: inputFocused
            ? '0 0 0 3px var(--color-primary-glow), 0 4px 16px rgba(0,0,0,0.2)'
            : '0 2px 12px rgba(0,0,0,0.1)',
          transition: 'border-color 200ms ease, box-shadow 200ms ease',
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

          {/* File previews — multiple files */}
          {attachedFiles.length > 0 && (
            <div style={{ padding: '12px 16px 0', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {attachedFiles.map((af, idx) => (
                <div key={idx} className="file-chip">
                  {af.type === 'image' && af.preview && (
                    <div className="relative inline-block">
                      <img src={af.preview} alt={`Attached file ${idx + 1}`} style={{ height: '70px', width: 'auto', borderRadius: '10px', border: '1px solid var(--chat-border)', objectFit: 'cover' }} />
                      <button onClick={() => removeFile(idx)} className="absolute flex items-center justify-center"
                        style={{ top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--chat-border)', border: '1px solid var(--color-border-hover)', color: 'var(--chat-text-secondary)', cursor: 'pointer' }}>
                        <X size={10} />
                      </button>
                    </div>
                  )}
                  {af.type === 'document' && (
                    <div className="inline-flex items-center gap-2" style={{ background: 'var(--chat-border)', border: '1px solid var(--color-border-hover)', borderRadius: '10px', padding: '5px 10px', fontSize: '12px' }}>
                      <FileText size={13} style={{ color: '#3B82F6' }} />
                      <span className="truncate" style={{ maxWidth: '120px', color: 'var(--chat-text)' }}>{af.file.name}</span>
                      {af.uploading && <div style={{ width: '12px', height: '12px', border: '1.5px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin-slow 1s linear infinite' }} />}
                      {af.uploaded && <span style={{ color: '#10B981', fontSize: '10px' }}>Ready</span>}
                      {af.error && <span style={{ color: '#EF4444', fontSize: '10px' }}>Error</span>}
                      {!af.uploading && <button onClick={() => removeFile(idx)} style={{ color: 'var(--chat-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={11} /></button>}
                    </div>
                  )}
                  {af.type === 'audio' && (
                    <div className="inline-flex items-center gap-2" style={{ background: 'var(--chat-border)', border: '1px solid var(--color-border-hover)', borderRadius: '10px', padding: '5px 10px', fontSize: '12px' }}>
                      <Music size={13} style={{ color: '#10B981' }} />
                      <span className="truncate" style={{ maxWidth: '120px', color: 'var(--chat-text)' }}>{af.file.name}</span>
                      {af.uploading && <div style={{ width: '12px', height: '12px', border: '1.5px solid var(--color-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin-slow 1s linear infinite' }} />}
                      {af.uploaded && <span style={{ color: '#10B981', fontSize: '10px' }}>Ready</span>}
                      {!af.uploading && <button onClick={() => removeFile(idx)} style={{ color: 'var(--chat-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={11} /></button>}
                    </div>
                  )}
                  {af.type === 'video' && (
                    <div className="inline-flex items-center gap-2" style={{ background: 'var(--chat-border)', border: '1px solid var(--color-border-hover)', borderRadius: '10px', padding: '5px 10px', fontSize: '12px' }}>
                      <Film size={13} style={{ color: 'var(--color-primary)' }} />
                      <span className="truncate" style={{ maxWidth: '120px', color: 'var(--chat-text)' }}>{af.file.name}</span>
                      <button onClick={() => removeFile(idx)} style={{ color: 'var(--chat-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={11} /></button>
                    </div>
                  )}
                </div>
              ))}
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
                multiple
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
                    ? 'rgba(239,68,68,0.08)'
                    : canSend
                      ? 'linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))'
                      : 'var(--chat-surface)',
                  border: isLoading ? '1px solid rgba(239,68,68,0.25)' : canSend ? 'none' : '1px solid var(--chat-border)',
                  cursor: (canSend || isLoading) ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 200ms ease',
                  boxShadow: canSend && !isLoading ? '0 2px 8px rgba(16,163,127,0.35)' : 'none',
                }}
              >
                {isLoading || fileLoading ? (
                  <Square size={14} style={{ color: 'var(--color-danger)', fill: 'var(--color-danger)' }} />
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
