import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { LoadingPage } from '../components/shared/LoadingPage'
import api from '../lib/api'

interface InviteData {
  organizationName: string
  organizationIndustry: string | null
  role: string
  invitedBy: string
  expiresAt: string
}

export function JoinPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [invite, setInvite] = useState<InviteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Invalid invite link.')
      setLoading(false)
      return
    }

    api
      .get(`/team/invite/${token}`)
      .then((res) => {
        setInvite(res.data.data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.response?.data?.message ?? 'Invalid or expired invite link.')
        setLoading(false)
      })
  }, [token])

  if (loading) return <LoadingPage />

  if (error)
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">Invalid Invite</h2>
          <p className="text-sm text-text-muted mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    )

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="bg-surface border border-border rounded-2xl p-10 max-w-[440px] w-full text-center">
        {/* Logo */}
        <div className="w-14 h-14 rounded-[14px] bg-gradient-to-br from-accent-start to-accent-end flex items-center justify-center mx-auto mb-6">
          <Zap size={24} className="text-white" />
        </div>

        {/* Org name */}
        <h1 className="text-[22px] font-bold text-text-primary mb-2">
          Join {invite?.organizationName}
        </h1>

        {/* Invite details */}
        <p className="text-sm text-text-muted mb-6 leading-relaxed">
          <strong className="text-text-primary">{invite?.invitedBy}</strong> has invited you to join as{' '}
          <strong className="text-primary capitalize">{invite?.role}</strong>
        </p>

        {/* Role badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full mb-8">
          <span className="text-base">{invite?.role === 'manager' ? '\uD83D\uDC54' : '\uD83D\uDC64'}</span>
          <span className="text-sm font-medium text-primary capitalize">{invite?.role}</span>
        </div>

        {/* Industry */}
        {invite?.organizationIndustry && (
          <p className="text-xs text-text-muted mb-6">Industry: {invite.organizationIndustry}</p>
        )}

        {/* Expiry */}
        <p className="text-xs text-text-dim mb-6">
          This invite expires on {new Date(invite?.expiresAt ?? '').toLocaleDateString()}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/login?inviteToken=${token}`)}
            className="flex-1 py-3 bg-transparent border border-border rounded-xl text-sm text-text-muted hover:bg-surface-2 transition-colors"
          >
            I have an account
          </button>
          <button
            onClick={() =>
              navigate(
                `/register?token=${token}&org=${encodeURIComponent(invite?.organizationName ?? '')}&role=${invite?.role}`
              )
            }
            className="flex-1 py-3 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            Create Account
          </button>
        </div>
      </div>
    </div>
  )
}

export default JoinPage
