import { FileText, FileSpreadsheet, Presentation, FileType, Download } from 'lucide-react'
import type { Message } from '../../types'

const FORMAT_ICON: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: FileType,
  pptx: Presentation,
  xlsx: FileSpreadsheet,
}

interface FileDownloadCardProps {
  file: NonNullable<Message['fileGeneration']>
}

export function FileDownloadCard({ file }: FileDownloadCardProps) {
  const Icon = FORMAT_ICON[file.format] || FileText

  return (
    <div
      style={{
        margin: '12px 0',
        padding: '14px 16px',
        borderRadius: 12,
        border: '1px solid rgba(124, 58, 237, 0.22)',
        background: 'rgba(124, 58, 237, 0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <Icon size={20} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={file.title}
        >
          {file.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
          {file.formatLabel} · {file.fileSizeLabel}
        </div>
      </div>

      <a
        href={file.downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={file.fileName}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          boxShadow: '0 1px 2px rgba(124, 58, 237, 0.25)',
        }}
      >
        <Download size={14} />
        Download
      </a>
    </div>
  )
}
