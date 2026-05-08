import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface MobilePageHeaderProps {
  title: string
  subtitle?: string
  backTo?: string | number
  action?: ReactNode
}

export function MobilePageHeader({ title, subtitle, backTo = -1, action }: MobilePageHeaderProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (typeof backTo === 'number') navigate(backTo)
    else navigate(backTo)
  }

  return (
    <header className="mobile-page-header">
      <button
        type="button"
        className="mobile-page-back"
        onClick={handleBack}
        aria-label="Go back"
      >
        <ChevronLeft size={22} />
      </button>
      <div className="mobile-page-title-wrap">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="mobile-page-action">{action}</div>
    </header>
  )
}
