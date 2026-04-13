import { useState } from 'react'
import { FileText, Download, Loader2 } from 'lucide-react'
import { useToast } from '../../hooks/useToast'

interface DocumentDownloadBarProps {
  content: string
  contentRef: React.RefObject<HTMLElement | null>
  title: string
}

export function DocumentDownloadBar({ content, contentRef, title }: DocumentDownloadBarProps) {
  const [status, setStatus] = useState<'idle' | 'pdf' | 'docx'>('idle')
  const toast = useToast()

  const handlePdf = async () => {
    if (!contentRef.current) return
    setStatus('pdf')
    try {
      const { exportToPdf } = await import('../../lib/documentExport')
      await exportToPdf(contentRef.current, title)
    } catch (err) {
      console.error('PDF export failed:', err)
      toast.error('PDF download failed. Please try again.')
    } finally {
      setStatus('idle')
    }
  }

  const handleDocx = async () => {
    setStatus('docx')
    try {
      const { exportToDocx } = await import('../../lib/documentExport')
      await exportToDocx(content, title)
    } catch (err) {
      console.error('DOCX export failed:', err)
      toast.error('DOCX download failed. Please try again.')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      marginTop: '12px', padding: '10px 16px',
      background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(59,130,246,0.06))',
      border: '1px solid rgba(124,58,237,0.15)',
      borderRadius: '12px',
    }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '8px',
        background: 'linear-gradient(135deg, #7C3AED, #3B82F6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <FileText size={16} style={{ color: 'white' }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          Download as document
        </div>
      </div>

      <button onClick={handlePdf} disabled={status !== 'idle'}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
          border: '1px solid rgba(124,58,237,0.3)', cursor: 'pointer',
          background: status === 'pdf' ? 'var(--color-primary)' : 'transparent',
          color: status === 'pdf' ? 'white' : '#7C3AED',
          transition: 'all 150ms', opacity: status !== 'idle' && status !== 'pdf' ? 0.5 : 1,
        }}
        onMouseEnter={e => { if (status === 'idle') { e.currentTarget.style.background = '#7C3AED'; e.currentTarget.style.color = 'white' } }}
        onMouseLeave={e => { if (status === 'idle') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7C3AED' } }}
      >
        {status === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        PDF
      </button>

      <button onClick={handleDocx} disabled={status !== 'idle'}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
          border: '1px solid rgba(59,130,246,0.3)', cursor: 'pointer',
          background: status === 'docx' ? '#3B82F6' : 'transparent',
          color: status === 'docx' ? 'white' : '#3B82F6',
          transition: 'all 150ms', opacity: status !== 'idle' && status !== 'docx' ? 0.5 : 1,
        }}
        onMouseEnter={e => { if (status === 'idle') { e.currentTarget.style.background = '#3B82F6'; e.currentTarget.style.color = 'white' } }}
        onMouseLeave={e => { if (status === 'idle') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#3B82F6' } }}
      >
        {status === 'docx' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        DOCX
      </button>
    </div>
  )
}
