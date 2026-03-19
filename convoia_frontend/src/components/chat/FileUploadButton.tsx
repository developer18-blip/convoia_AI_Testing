import { useRef } from 'react'
import { Paperclip, X, FileText, Image, Music, Film } from 'lucide-react'

export interface UploadedFile {
  file: File
  preview?: string
  type: 'image' | 'document' | 'audio' | 'video'
}

interface Props {
  onFileSelect: (file: File) => void
  onClear: () => void
  selectedFile: UploadedFile | null
  loading: boolean
}

function getFileIcon(type: string) {
  switch (type) {
    case 'image':
      return <Image size={14} />
    case 'audio':
      return <Music size={14} />
    case 'video':
      return <Film size={14} />
    default:
      return <FileText size={14} />
  }
}

export function FileUploadButton({ onFileSelect, onClear, selectedFile, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    onFileSelect(file)
    e.target.value = ''
  }

  if (selectedFile) {
    return (
      <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm">
        <span className="text-text-secondary">{getFileIcon(selectedFile.type)}</span>
        <span className="text-text-secondary truncate max-w-32">{selectedFile.file.name}</span>
        {loading ? (
          <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <button onClick={onClear} className="text-text-muted hover:text-danger transition-colors">
            <X size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,audio/*,video/*"
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="p-2 rounded-lg text-text-muted hover:text-white hover:bg-surface-2 transition-colors"
        title="Attach file (images, PDFs, audio, video)"
      >
        <Paperclip size={18} />
      </button>
    </>
  )
}
