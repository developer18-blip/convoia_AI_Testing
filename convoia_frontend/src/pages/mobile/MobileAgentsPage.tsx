import { useState } from 'react'
import { Search } from 'lucide-react'
import { useAgents } from '../../hooks/useAgents'

const CATEGORIES = ['All', 'Chat', 'Image', 'Code', 'Research']

export function MobileAgentsPage() {
  const { agents, loading: isLoading } = useAgents()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  const filtered = agents.filter(a => {
    if (!a.isActive) return false
    const q = search.toLowerCase().trim()
    if (q && !a.name.toLowerCase().includes(q) && !a.role.toLowerCase().includes(q) && !a.description?.toLowerCase().includes(q)) return false
    if (category !== 'All') {
      const role = a.role.toLowerCase()
      if (category === 'Chat' && !role.includes('chat') && !role.includes('general') && !role.includes('assistant')) return false
      if (category === 'Image' && !role.includes('image') && !role.includes('design') && !role.includes('creative')) return false
      if (category === 'Code' && !role.includes('code') && !role.includes('dev') && !role.includes('engineer')) return false
      if (category === 'Research' && !role.includes('research') && !role.includes('analy')) return false
    }
    return true
  })

  if (isLoading) {
    return (
      <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ height: '100px', borderRadius: '16px', background: 'var(--color-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.5px' }}>Agents</h1>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search agents..."
          style={{
            width: '100%', padding: '12px 12px 12px 40px', borderRadius: '14px',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none',
          }}
        />
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            style={{
              padding: '7px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              background: category === cat ? '#7C3AED' : 'var(--color-surface-2)',
              color: category === cat ? 'white' : 'var(--color-text-secondary)',
              transition: 'all 150ms',
            }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Agent cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)' }}>
            <p style={{ fontSize: '14px' }}>No agents found</p>
          </div>
        ) : (
          filtered.map(agent => (
            <div key={agent.id} style={{
              background: 'var(--color-surface)', borderRadius: '16px', padding: '16px',
              border: '1px solid var(--color-border)', cursor: 'pointer',
              transition: 'all 200ms',
            }}>
              {/* Icon */}
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'var(--color-surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', marginBottom: '12px',
              }}>
                {agent.avatar}
              </div>
              {/* Name */}
              <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>{agent.name}</p>
              {/* Description */}
              <p style={{
                fontSize: '12px', color: 'var(--color-text-muted)', margin: '0 0 8px', lineHeight: '1.4',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
              }}>
                {agent.description || agent.role}
              </p>
              {/* Model badge */}
              {agent.defaultModel && (
                <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '8px', background: 'var(--color-primary-light)', color: 'var(--color-primary)', fontWeight: 600 }}>
                  {agent.defaultModel.name}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default MobileAgentsPage
