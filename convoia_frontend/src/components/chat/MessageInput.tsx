import { forwardRef, useImperativeHandle, useState, useRef, useEffect, useMemo, type KeyboardEvent } from 'react'
import { ArrowUp, Plus, Square, X, Link2 } from 'lucide-react'
import { VoiceInputButton } from './VoiceInputButton'
import { ImageGenerationModal } from './ImageGenerationModal'
import { AttachmentChip } from './AttachmentChip'

interface AttachedFile {
  file: File
  type: 'image' | 'document' | 'audio' | 'video'
  preview?: string
  /** Legacy path (images): base64 preview piped through as referenceImage. */
  extractedText?: string
  transcript?: string
  uploading: boolean
  uploaded: boolean
  error?: string
  /** Set once the file is persisted as a ConversationAttachment in the backend. */
  attachmentId?: string
  /** 0-100 while uploading, undefined or 100 once complete. */
  uploadProgress?: number
  /** Classified file type returned by backend — used by AttachmentChip icon picker. */
  attachmentKind?: string
  /** Server-provided thumbnail URL for persisted images. */
  serverThumbnail?: string
}

export interface MessageInputHandle {
  /** Adds files to the staged list (used by DragDropOverlay). */
  addFiles: (files: File[]) => void
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
  onSendWithContext?: (text: string, systemContext: string | null, extras?: { fileAttachment?: { name: string; type: 'image' | 'document' | 'audio' | 'video'; size: number }; imagePreview?: string; imagePreviews?: string[]; attachmentIds?: string[] }) => void
  onError?: (message: string) => void
  latestAIResponse?: string
  /** Conversation id the uploaded files should be bound to. Required for
   *  doc/audio/code attachments to persist via the new /files/attach
   *  endpoint; when absent, non-image uploads fall back to the legacy
   *  /files/upload path so this component stays usable elsewhere. */
  conversationId?: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput({
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
  latestAIResponse,
  conversationId,
}, ref) {
  void _selectedModelId; void _onFileProcessed; void _onError;
  const [value, setValue] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [fileLoading, _setFileLoading] = useState(false); void _setFileLoading;
  const [fileError, setFileError] = useState<string | null>(null)
  const [imageGenOpen, setImageGenOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const detectedUrls = useMemo(() => {
    const withoutCode = value.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '')
    const matches = withoutCode.match(/https?:\/\/[^\s<>"{}|\\^`\[\]()]+/gi) || []
    return [...new Set(matches.map(u => u.replace(/[.,;:!?)]+$/, '')))]
      .filter(u => !/\.(png|jpg|jpeg|gif|svg|webp|mp4|mov|avi)$/i.test(u))
      .slice(0, 3)
  }, [value])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Expose an imperative API so the surrounding DragDropOverlay can
  // push files into the staging area without prop-drilling state.
  useImperativeHandle(ref, () => ({
    addFiles: (files: File[]) => {
      files.forEach((f) => handleFileSelect(f))
    },
  }))

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

    // Images still flow through the existing base64 referenceImage path
    // (one-shot vision analysis). Everything else persists as a
    // structured ConversationAttachment via /files/attach.
    if (type === 'document' || type === 'audio') {
      uploadToAttach(file, attachedFiles.length)
    }
  }

  /**
   * Upload a file to the new /files/attach endpoint, which persists it
   * as a ConversationAttachment the AI can reference across turns.
   * Uses XHR (not fetch) so we can surface real upload progress in the
   * chip. Routes document, audio, AND image files through here now —
   * the server extracts/transcribes as appropriate and returns a
   * stable attachmentId.
   *
   * Falls back to the legacy /files/upload flow (in-memory extractedText)
   * only if conversationId is not provided.
   */
  const uploadToAttach = (file: File, idx: number) => {
    if (!conversationId) {
      // No conversation yet — legacy path still works via extractedText
      // injection. Uncommon for the chat page, used by other mounts.
      return legacyUpload(file, idx)
    }
    setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: true, uploadProgress: 0 } : f))

    const formData = new FormData()
    formData.append('file', file)
    formData.append('conversationId', conversationId)
    const token = localStorage.getItem('convoia_token')

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_URL}/files/attach`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return
      const pct = Math.round((e.loaded / e.total) * 100)
      setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploadProgress: pct } : f))
    }
    xhr.onerror = () => {
      setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: 'Upload failed' } : f))
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}')
        if (xhr.status >= 200 && xhr.status < 300 && data.success && data.data?.attachmentId) {
          setAttachedFiles(prev => prev.map((f, i) => i === idx ? {
            ...f,
            uploading: false,
            uploaded: true,
            uploadProgress: 100,
            attachmentId: data.data.attachmentId,
            attachmentKind: data.data.fileType,
            serverThumbnail: data.data.thumbnail || undefined,
          } : f))
        } else {
          const msg = data?.message || data?.data?.warning || `Upload failed (${xhr.status})`
          setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: msg } : f))
        }
      } catch {
        setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: 'Bad server response' } : f))
      }
    }
    xhr.send(formData)
  }

  /** Legacy /files/upload path — returns extractedText/transcript in-memory.
   *  Still used when conversationId isn't available. */
  const legacyUpload = async (file: File, idx: number) => {
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
      if (data.success && data.data?.extractedText) {
        setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, uploaded: true, extractedText: data.data.extractedText } : f))
      } else if (data.success && data.data?.transcript) {
        setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, uploaded: true, transcript: data.data.transcript } : f))
      } else {
        setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: data.data?.warning || data.message || 'Failed to process' } : f))
      }
    } catch {
      setAttachedFiles(prev => prev.map((f, i) => i === idx ? { ...f, uploading: false, error: 'Failed to process' } : f))
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

      // Structured attachment ids — the backend loads their content
      // from ConversationAttachment and prepends it to the last user
      // message before calling the model. The frontend no longer
      // inlines the extracted text into the visible user bubble.
      const attachmentIds = attachedFiles
        .map(f => f.attachmentId)
        .filter((id): id is string => !!id)

      // Legacy fallback: if a file uploaded via the old extractedText
      // path (no conversationId at the time), we still need to inline
      // its content so the AI gets something useful this turn.
      const legacyContextParts: string[] = []
      let legacyIdx = 0
      for (const f of [...docs, ...audios]) {
        if (f.attachmentId) continue // already persisted server-side
        const content = f.extractedText || f.transcript
        if (content) {
          legacyIdx++
          legacyContextParts.push(`═══ DOCUMENT ${legacyIdx}: ${f.file.name} ═══\n${content}\n═══ END DOCUMENT ${legacyIdx} ═══`)
        }
      }
      const legacyContext = legacyContextParts.length > 0 ? legacyContextParts.join('\n\n') : null

      // Image previews (base64) continue on the referenceImage path —
      // Phase 1 doesn't migrate image processing to structured attachments.
      const allImagePreviews: string[] = []
      for (const img of images) {
        if (img.preview) allImagePreviews.push(img.preview)
      }

      const totalFiles = attachedFiles.length
      const defaultQuestion = totalFiles > 1
        ? `Analyze these ${totalFiles} files`
        : images.length === 1 ? 'Analyze this image'
        : docs.length === 1 ? 'Analyze this document'
        : 'Analyze this file'
      const question = value.trim() || defaultQuestion

      const allFileNames = attachedFiles.map(f => f.file.name).join(', ')
      const totalSize = attachedFiles.reduce((s, f) => s + f.file.size, 0)
      const primaryType = images.length > 0 ? 'image' as const : 'document' as const

      if (onSendWithContext) {
        // Only include legacy context as systemContext; attachmentIds
        // drive server-side context for the new path.
        const visibleText = legacyContext ? `${question}\n\n${legacyContext}` : question
        onSendWithContext(
          visibleText,
          null,
          {
            fileAttachment: { name: allFileNames, type: primaryType, size: totalSize },
            imagePreview: allImagePreviews[0],
            imagePreviews: allImagePreviews.length > 1 ? allImagePreviews : undefined,
            attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
          },
        )
      } else if (legacyContext) {
        onSend(`${question}\n\n${legacyContext}`)
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
    <div className="chat-input-container" style={{ flexShrink: 0, padding: '0 10px 12px', backgroundColor: 'var(--chat-bg)' }}>
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

          {/* File chip strip — uses AttachmentChip for consistent UX
              (thumbnails for images, type icons for docs/audio, upload
              progress bar along the chip's bottom edge, error state). */}
          {attachedFiles.length > 0 && (
            <div style={{ padding: '12px 16px 0', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {attachedFiles.map((af, idx) => {
                const chipKind =
                  af.attachmentKind ||
                  (af.type === 'image' ? 'image'
                    : af.type === 'audio' ? 'audio'
                    : af.type === 'video' ? 'video'
                    : af.file.type === 'application/pdf' ? 'pdf'
                    : af.file.type.includes('wordprocessingml') || af.file.type === 'application/msword' ? 'docx'
                    : 'document')
                return (
                  <AttachmentChip
                    key={idx}
                    attachment={{
                      fileName: af.file.name,
                      fileType: chipKind,
                      fileSize: af.file.size,
                      uploadProgress: af.uploading ? (af.uploadProgress ?? 0) : (af.uploaded ? 100 : undefined),
                      thumbnail: af.preview || af.serverThumbnail,
                      error: af.error,
                    }}
                    onRemove={() => removeFile(idx)}
                  />
                )
              })}
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
              // Accept ANY pasted file (image, PDF, doc, audio) — not
              // just images. Matches Claude/ChatGPT clipboard UX.
              const filesPasted: File[] = []
              for (const item of Array.from(items)) {
                if (item.kind === 'file') {
                  const f = item.getAsFile()
                  if (f) filesPasted.push(f)
                }
              }
              if (filesPasted.length > 0) {
                e.preventDefault()
                filesPasted.forEach(f => handleFileSelect(f))
              }
            }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={disabled ? "No tokens available — contact your admin or purchase tokens" : "Message ConvoiaAI..."}
            rows={1}
            disabled={disabled || fileLoading}
            aria-label="Message input"
            style={{
              width: '100%', backgroundColor: 'transparent', border: 'none', outline: 'none',
              color: 'var(--chat-text)', fontSize: '15px', lineHeight: '1.6', resize: 'none',
              height: '56px', /* controlled by useEffect */
              fontFamily: 'Inter, system-ui, sans-serif',
              padding: '14px 16px 8px', overflowWrap: 'break-word', wordBreak: 'break-word',
              overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--chat-border) transparent',
            }}
          />

          {/* URL detection chips */}
          {detectedUrls.length > 0 && (
            <div style={{ padding: '0 16px 4px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {detectedUrls.map((url, i) => (
                <div key={i} className="inline-flex items-center gap-1.5" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '8px', padding: '3px 8px', fontSize: '11px', color: '#60A5FA' }}>
                  <Link2 size={11} />
                  <span className="truncate" style={{ maxWidth: '180px' }}>{url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                  <span style={{ color: 'rgba(96,165,250,0.6)', fontSize: '10px' }}>will be fetched</span>
                </div>
              ))}
            </div>
          )}

          {/* Bottom bar inside pill */}
          <div className="flex items-center justify-between" style={{ padding: '6px 12px 12px' }}>
            {/* Left: Plus button + voice */}
            <div className="flex items-center" style={{ gap: '2px' }}>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,text/markdown,application/json,application/x-yaml,text/yaml,audio/*,video/*,.py,.ts,.tsx,.js,.jsx,.mjs,.cjs,.java,.cpp,.cc,.cxx,.c,.h,.hpp,.go,.rs,.rb,.php,.sh,.bash,.sql,.html,.htm,.css,.scss,.xml,.toml,.yaml,.yml,.json,.md,.markdown,.ini,.env,.txt,.xlsx,.xls,.csv"
                multiple
                onChange={handleFileInputChange}
              />
              <button
                onClick={(e) => { e.stopPropagation(); if (!disabled) fileInputRef.current?.click() }}
                title={disabled ? "No tokens available" : "Attach file"}
                disabled={disabled}
                style={{
                  width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'transparent',
                  border: 'none', color: 'var(--chat-text-muted)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'all 150ms',
                  opacity: disabled ? 0.4 : 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-border)'; e.currentTarget.style.color = 'var(--chat-text)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--chat-text-muted)' }}
              >
                <Plus size={18} />
              </button>
              <VoiceInputButton
                onTranscript={(text) => setValue((prev) => prev + (prev ? ' ' : '') + text)}
                onAutoSend={(text) => { onSend(text) }}
                disabled={isLoading || fileLoading}
                onSpeakResponse={latestAIResponse}
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
      <p className="hidden sm:block" style={{ textAlign: 'center', fontSize: '11px', color: 'var(--chat-text-dim)', marginTop: '6px', opacity: 0.5 }}>
        ConvoiaAI can make mistakes. Check important info.
      </p>

      <ImageGenerationModal
        isOpen={imageGenOpen}
        onClose={() => setImageGenOpen(false)}
        onImageGenerated={handleImageGenerated}
      />
    </div>
  )
})
