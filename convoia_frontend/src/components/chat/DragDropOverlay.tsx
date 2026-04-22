import { useEffect, useState, useRef, type ReactNode } from 'react'

/**
 * Full-screen drag-and-drop overlay.
 *
 * Why a ref (not state) for the counter: React batches setState, so two
 * close-together drag events could fire before the counter update from
 * the first one lands, leaving dragCounter stuck at > 0 after the drop.
 * A ref mutates synchronously.
 *
 * Why `pointerEvents: 'none'` on the overlay: during a drag, the
 * browser routes the `drop` event to whatever element is under the
 * cursor. If the overlay has default pointer-events, the drop lands
 * ON THE OVERLAY (which has no drop handler), the window-level
 * listener never fires, and the overlay sticks. Making it purely
 * visual forwards the drop to whatever's beneath it.
 *
 * Safety nets: if the counter ever gets stuck (edge cases where the
 * browser misses a dragleave — happens with some window managers and
 * plugins), pressing Escape or alt-tabbing away dismisses the overlay.
 */

interface Props {
  onFilesDropped: (files: File[]) => void
  children: ReactNode
}

export function DragDropOverlay({ onFilesDropped, children }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  useEffect(() => {
    const resetOverlay = () => {
      dragCounterRef.current = 0
      setIsDragging(false)
    }

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Ignore drags that aren't files (text selection, image inside the page, etc.)
      if (!e.dataTransfer?.types.includes('Files')) return
      dragCounterRef.current += 1
      setIsDragging(true)
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!e.dataTransfer?.types.includes('Files')) return
      dragCounterRef.current -= 1
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setIsDragging(false)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Reset synchronously BEFORE firing the callback — guarantees the
      // overlay is gone by the time the consumer starts upload work.
      resetOverlay()
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) onFilesDropped(files)
    }

    // Safety nets
    const handleBlur = () => resetOverlay()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetOverlay()
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('keydown', handleKeyDown)
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
            // Purely visual — never intercept drop events, otherwise the
            // drop lands on the overlay div and the window listener
            // never fires, leaving the overlay stuck.
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
              pointerEvents: 'none',
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
