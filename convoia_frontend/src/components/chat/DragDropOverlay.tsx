import { useEffect, useState, type ReactNode } from 'react'

/**
 * Full-screen drag-and-drop overlay. Listens at the window level so a
 * file dragged anywhere over the chat page is caught, not just over the
 * composer. Uses a counter pattern (enter++ / leave--) so the overlay
 * doesn't flicker off when the pointer crosses inner element boundaries.
 */

interface Props {
  onFilesDropped: (files: File[]) => void
  children: ReactNode
}

export function DragDropOverlay({ onFilesDropped, children }: Props) {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    let counter = 0

    const handleDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      counter += 1
      setIsDragging(true)
    }

    const handleDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      counter = Math.max(0, counter - 1)
      if (counter === 0) setIsDragging(false)
    }

    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      // Hint "copy" cursor so the OS doesn't show the forbidden icon
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      counter = 0
      setIsDragging(false)
      const files = Array.from(e.dataTransfer.files || [])
      if (files.length > 0) onFilesDropped(files)
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [onFilesDropped])

  return (
    <>
      {children}
      {isDragging && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(124, 58, 237, 0.10)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '40px 60px',
              borderRadius: 16,
              background: 'rgba(255, 255, 255, 0.96)',
              border: '2px dashed #7c3aed',
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(124, 58, 237, 0.25)',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>📎</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
              Drop files to attach
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              PDF, Word, images, audio, code & text files
            </div>
          </div>
        </div>
      )}
    </>
  )
}
