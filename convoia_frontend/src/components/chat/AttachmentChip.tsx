import { FileText, FileType, FileSpreadsheet, Image as ImageIcon, Music, Film, Code2, FileQuestion, X } from 'lucide-react'

/**
 * File chip shown above the composer while a file is staged for send,
 * and persisted on the user message bubble afterward. Mirrors the
 * Claude / ChatGPT pattern: icon or thumbnail, name, size/progress,
 * remove X, subtle upload progress bar along the bottom edge.
 */

export interface ChipAttachment {
  fileName: string
  fileType: string
  fileSize: number
  /** 0-100 while uploading; undefined or 100 means upload complete */
  uploadProgress?: number
  /** URL (usually /api/uploads/attachments/...) or object-URL for image preview */
  thumbnail?: string
  /** Extraction or upload error message — renders chip in red state */
  error?: string
}

interface Props {
  attachment: ChipAttachment
  onRemove?: () => void
  onClick?: () => void
}

function iconFor(type: string) {
  const common = { size: 16 }
  switch (type) {
    case 'image':  return <ImageIcon {...common} />
    case 'audio':  return <Music {...common} />
    case 'video':  return <Film {...common} />
    case 'pdf':    return <FileType {...common} />
    case 'docx':   return <FileText {...common} />
    case 'xlsx':
    case 'csv':    return <FileSpreadsheet {...common} />
    case 'code':   return <Code2 {...common} />
    case 'text':   return <FileText {...common} />
    default:       return <FileQuestion {...common} />
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AttachmentChip({ attachment, onRemove, onClick }: Props) {
  const isUploading = typeof attachment.uploadProgress === 'number' && attachment.uploadProgress < 100
  const hasError = !!attachment.error
  const progressPct = Math.max(0, Math.min(100, attachment.uploadProgress ?? 100))

  const bg = hasError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(124, 58, 237, 0.06)'
  const border = hasError ? 'rgba(239, 68, 68, 0.35)' : 'rgba(124, 58, 237, 0.22)'
  const textColor = hasError ? '#991b1b' : '#1e293b'
  const metaColor = hasError ? '#dc2626' : '#64748b'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px 6px 6px',
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        maxWidth: 260,
        minWidth: 180,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Thumbnail or icon */}
      {attachment.thumbnail ? (
        <img
          src={attachment.thumbnail}
          alt=""
          style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            flexShrink: 0,
            background: hasError ? '#fee2e2' : 'rgba(124, 58, 237, 0.15)',
            color: hasError ? '#991b1b' : '#7c3aed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {iconFor(attachment.fileType)}
        </div>
      )}

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          title={attachment.fileName}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: textColor,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {attachment.fileName}
        </div>
        <div style={{ fontSize: 10, color: metaColor }}>
          {hasError
            ? attachment.error
            : isUploading
              ? `Uploading ${progressPct}%`
              : formatSize(attachment.fileSize)}
        </div>
      </div>

      {/* Remove button */}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label="Remove attachment"
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.08)',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X size={12} />
        </button>
      )}

      {/* Upload progress bar */}
      {isUploading && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: 2,
            width: `${progressPct}%`,
            background: '#7c3aed',
            transition: 'width 0.2s',
          }}
        />
      )}
    </div>
  )
}
