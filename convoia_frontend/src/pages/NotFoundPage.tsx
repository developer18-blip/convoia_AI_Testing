import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-8xl font-semibold text-primary mb-4">404</p>
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Page not found</h1>
        <p className="text-text-muted mb-8">The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/dashboard">
          <Button size="lg">
            <ArrowLeft size={18} />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  )
}

export default NotFoundPage;
