import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Bot, Code2, Image, Microscope, MessageCircle, Search, Sparkles, Zap } from 'lucide-react'
import { useAgents } from '../../hooks/useAgents'
import { useChat } from '../../hooks/useChat'
import { useToast } from '../../hooks/useToast'
import type { Agent } from '../../types'

const CATEGORIES = [
  { label: 'All', icon: Sparkles },
  { label: 'Chat', icon: MessageCircle },
  { label: 'Image', icon: Image },
  { label: 'Code', icon: Code2 },
  { label: 'Research', icon: Microscope },
] as const

type Category = typeof CATEGORIES[number]['label']

export function MobileAgentsPage() {
  const { agents, loading: isLoading } = useAgents()
  const { setAgentMode, setSelectedAgent } = useChat()
  const navigate = useNavigate()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category>('All')

  const activeAgents = useMemo(() => agents.filter(a => a.isActive), [agents])
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return activeAgents.filter(agent => {
      if (q && !agent.name.toLowerCase().includes(q) && !agent.role.toLowerCase().includes(q) && !agent.description?.toLowerCase().includes(q)) return false
      if (category === 'All') return true
      const role = agent.role.toLowerCase()
      const description = agent.description?.toLowerCase() || ''
      const haystack = `${role} ${description}`
      if (category === 'Chat') return /chat|general|assistant|support/.test(haystack)
      if (category === 'Image') return /image|design|creative|visual/.test(haystack)
      if (category === 'Code') return /code|dev|engineer|software/.test(haystack)
      return /research|analy|strategy|insight/.test(haystack)
    })
  }, [activeAgents, category, search])

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgent(agent)
    setAgentMode(true)
    toast.success(`${agent.name} is ready`)
    navigate('/chat')
  }

  if (isLoading) {
    return (
      <div className="mobile-page" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ height: 52, borderRadius: 18, background: 'var(--color-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ height: 38, borderRadius: 999, width: '80%', background: 'var(--color-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="mobile-card" style={{ height: 150, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-page" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Compact hero banner ── */}
      <section style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 24,
        padding: '16px 18px',
        color: 'white',
        background: 'linear-gradient(135deg, #111827 0%, #1E3A8A 45%, var(--color-primary) 100%)',
        boxShadow: '0 16px 40px var(--color-primary-glow)',
        flexShrink: 0,
      }}>
        {/* decorative orb */}
        <div style={{ position: 'absolute', right: -24, top: -24, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 16, background: 'rgba(255,255,255,0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap size={20} fill="white" color="white" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.10em' }}>AI Specialists</p>
            <h2 style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 900, lineHeight: 1.1, letterSpacing: 0 }}>
              Pick the right brain
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span style={heroPill}>{activeAgents.length} active</span>
          </div>
        </div>
      </section>

      {/* ── Search ── */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search agents…"
          style={{
            width: '100%',
            minHeight: 46,
            padding: '0 14px 0 42px',
            borderRadius: 16,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            fontSize: 15,
            fontWeight: 600,
            outline: 'none',
            boxShadow: '0 8px 20px rgba(26,26,46,0.04)',
          }}
        />
      </div>

      {/* ── Category chips ── */}
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', paddingBottom: 2, flexShrink: 0, WebkitOverflowScrolling: 'touch' as const, touchAction: 'pan-x' }}>
        {CATEGORIES.map(({ label, icon: Icon }) => {
          const active = category === label
          return (
            <button key={label} onClick={() => setCategory(label)}
              style={{
                minHeight: 34,
                padding: '0 13px',
                borderRadius: 999,
                border: active ? 'none' : '1px solid var(--color-primary-glow)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                color: active ? 'white' : 'var(--color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12.5,
                fontWeight: 800,
                boxShadow: active ? '0 8px 20px var(--color-primary-glow)' : 'none',
                transition: 'all 150ms',
              }}>
              <Icon size={13} />
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Agents list — vertical stack of full-width rows ── */}
      {filtered.length === 0 ? (
        <div className="mobile-card" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--color-text-muted)' }}>
          <Bot size={32} style={{ margin: '0 auto 12px', color: 'var(--color-text-dim)' }} />
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>No agents found</p>
          <p style={{ fontSize: 12, margin: '6px 0 0' }}>Try another category or search term.</p>
        </div>
      ) : (
        <>
          <p className="mobile-section-title" style={{ marginBottom: 6 }}>
            {filtered.length} {filtered.length === 1 ? 'agent' : 'agents'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((agent, idx) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                onClick={() => handleSelectAgent(agent)}
                isFeatured={idx === 0 && filtered.length > 1}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const heroPill: React.CSSProperties = {
  display: 'inline-flex',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.90)',
  fontSize: 11,
  fontWeight: 850,
  border: '1px solid rgba(255,255,255,0.10)',
}

function AgentRow({ agent, onClick, isFeatured }: { agent: Agent; onClick: () => void; isFeatured: boolean }) {
  return (
    <button onClick={onClick} className="mobile-card"
      style={{
        width: '100%',
        padding: '14px 16px',
        border: isFeatured ? '1.5px solid var(--color-primary)' : '1px solid var(--color-primary-glow)',
        display: 'flex', gap: 14, alignItems: 'center', textAlign: 'left',
        background: isFeatured
          ? 'linear-gradient(135deg, var(--color-primary-light), var(--color-primary-light))'
          : 'var(--color-surface)',
      }}>
      <AgentAvatar agent={agent} size={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
          <p style={{
            margin: 0,
            color: 'var(--color-text-primary)',
            fontSize: 15,
            fontWeight: 900,
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {agent.name}
          </p>
          {isFeatured && (
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 999,
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              flexShrink: 0,
            }}>
              Top pick
            </span>
          )}
        </div>
        <p style={{
          margin: 0,
          color: 'var(--color-text-muted)',
          fontSize: 12,
          lineHeight: 1.4,
          fontWeight: 600,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {agent.description || agent.role}
        </p>
        <span style={{
          display: 'inline-block',
          marginTop: 6,
          padding: '3px 8px',
          borderRadius: 999,
          background: 'var(--color-primary-light)',
          color: 'var(--color-primary)',
          fontSize: 10,
          fontWeight: 850,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {agent.defaultModel?.name || agent.role}
        </span>
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: 13,
        background: isFeatured ? 'var(--color-primary)' : 'var(--color-primary-light)',
        color: isFeatured ? 'white' : 'var(--color-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: isFeatured ? '0 8px 18px var(--color-primary-glow)' : 'none',
      }}>
        <ArrowRight size={16} />
      </div>
    </button>
  )
}

function AgentAvatar({ agent, size }: { agent: Agent; size: number }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.30),
      background: 'linear-gradient(135deg, var(--color-primary-glow), var(--color-primary-light))',
      border: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: Math.round(size * 0.44),
      flexShrink: 0,
    }}>
      {agent.avatar || <Bot size={Math.round(size * 0.44)} color="var(--color-primary)" />}
    </div>
  )
}

export default MobileAgentsPage
