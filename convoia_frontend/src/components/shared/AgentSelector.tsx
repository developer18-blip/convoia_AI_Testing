import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Plus, X, Thermometer, Hash, Zap, Search } from 'lucide-react'
import type { Agent, AIModel } from '../../types'

/** True on narrow screens (phones) — used for bottom sheet vs dropdown */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

interface AgentSelectorProps {
  agents: Agent[]
  models: AIModel[]
  selectedId: string | null
  onChange: (agent: Agent | null) => void
  onCreateAgent: (data: any) => Promise<Agent>
}

export function AgentSelector({ agents, models, selectedId, onChange, onCreateAgent }: AgentSelectorProps) {
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = agents.find((a) => a.id === selectedId)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowCreate(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (agent: Agent | null) => {
    onChange(agent)
    setIsOpen(false)
    setSearch('')
  }

  const q = search.toLowerCase().trim()
  const defaultAgents = agents.filter((a) => a.isDefault).filter((a) => !q || a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q))
  const myAgents = agents.filter((a) => !a.isDefault).filter((a) => !q || a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q))

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => { setIsOpen(!isOpen); setShowCreate(false); setSearch('') }}
        className="flex items-center gap-1.5 chat-topbar-btn"
        style={{
          padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
          background: selected ? 'var(--color-primary-light)' : 'var(--chat-surface)',
          color: selected ? 'var(--color-primary)' : 'var(--color-text-muted)',
          border: selected ? '1px solid var(--color-primary)' : '1px solid var(--chat-border)',
          transition: 'all 150ms', flexShrink: 0,
        }}
      >
        {selected ? (
          <>
            <span>{selected.avatar}</span>
            <span className="hidden sm:inline">{selected.name}</span>
          </>
        ) : (
          <>
            <Zap size={13} />
            <span className="hidden sm:inline">Agent</span>
          </>
        )}
        <ChevronDown size={10} className="hidden sm:inline" />
      </button>

      {/* Backdrop — mobile only */}
      {isOpen && isMobile && (
        <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => { setIsOpen(false); setShowCreate(false) }} />
      )}

      {/* Dropdown — desktop: absolute dropdown, mobile: bottom sheet */}
      {isOpen && !showCreate && (
        <div style={isMobile ? {
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
          backgroundColor: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
          borderRadius: '16px 16px 0 0', padding: '6px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
          maxHeight: '75vh', display: 'flex', flexDirection: 'column',
        } : {
          position: 'absolute', top: '100%', left: 0, zIndex: 50,
          marginTop: '4px', minWidth: '300px',
          backgroundColor: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
          borderRadius: '12px', padding: '6px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          maxHeight: '420px', display: 'flex', flexDirection: 'column',
        }}>
          {/* Drag handle — mobile only */}
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 4px' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--chat-border)' }} />
            </div>
          )}
          {/* Search bar */}
          <div style={{ padding: '4px 4px 6px', position: 'sticky', top: 0, background: 'var(--chat-surface)', zIndex: 1 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 10px', borderRadius: '8px',
              background: 'var(--chat-hover)', border: '1px solid var(--chat-border)',
            }}>
              <Search size={14} style={{ color: 'var(--color-text-dim)', flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents..."
                autoFocus
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--color-text-primary)', fontSize: '12px',
                }}
              />
              {search && (
                <button onClick={() => { setSearch(''); searchRef.current?.focus() }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <X size={12} style={{ color: 'var(--color-text-dim)' }} />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* No agent option */}
          <button
            onClick={() => handleSelect(null)}
            className="w-full text-left"
            style={{
              padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '10px',
              border: 'none', backgroundColor: 'transparent', transition: 'background-color 150ms',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chat-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>🚫</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: 500 }}>No Agent</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Use default system prompt</div>
            </div>
            {!selectedId && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
          </button>

          <div style={{ borderTop: '1px solid var(--chat-border)', margin: '4px 0' }} />

          {/* Default employees */}
          {defaultAgents.length > 0 && (
            <>
              <div style={{ padding: '6px 12px 2px', fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                AI Team
              </div>
              {defaultAgents.map((agent) => (
                <AgentOption key={agent.id} agent={agent} isSelected={agent.id === selectedId} onSelect={handleSelect} />
              ))}
            </>
          )}

          {/* User's custom employees */}
          {myAgents.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--chat-border)', margin: '4px 0' }} />
              <div style={{ padding: '6px 12px 2px', fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                My Employees
              </div>
              {myAgents.map((agent) => (
                <AgentOption key={agent.id} agent={agent} isSelected={agent.id === selectedId} onSelect={handleSelect} />
              ))}
            </>
          )}

          {/* Hire new */}
          <div style={{ borderTop: '1px solid var(--chat-border)', margin: '4px 0' }} />
          <button
            onClick={() => setShowCreate(true)}
            className="w-full text-left"
            style={{
              padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '10px',
              border: 'none', backgroundColor: 'transparent', transition: 'background-color 150ms',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chat-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span style={{ fontSize: '14px', width: '28px', textAlign: 'center', color: 'var(--color-primary)' }}><Plus size={16} /></span>
            <div style={{ fontSize: '13px', color: 'var(--color-primary)', fontWeight: 500 }}>Hire New Employee</div>
          </button>
          </div>{/* end scrollable list */}
        </div>
      )}

      {/* Create Agent Modal (inline dropdown) */}
      {isOpen && showCreate && (
        <CreateAgentForm
          models={models}
          onClose={() => setShowCreate(false)}
          onCreate={async (data) => {
            const agent = await onCreateAgent(data)
            onChange(agent)
            setShowCreate(false)
            setIsOpen(false)
          }}
        />
      )}
    </div>
  )
}

function AgentOption({ agent, isSelected, onSelect }: { agent: Agent; isSelected: boolean; onSelect: (a: Agent) => void }) {
  return (
    <button
      onClick={() => onSelect(agent)}
      className="w-full text-left"
      style={{
        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '10px',
        border: 'none', backgroundColor: 'transparent', transition: 'background-color 150ms',
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--chat-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      <span style={{ fontSize: '18px', width: '28px', textAlign: 'center' }}>{agent.avatar}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{agent.name}</span>
          <span style={{ fontSize: '10px', color: 'var(--color-text-dim)', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'var(--chat-hover)' }}>
            {agent.role}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.description}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '3px', fontSize: '10px', color: 'var(--color-text-dim)' }}>
          <span>🌡️ {agent.temperature}</span>
          <span>📝 {agent.maxTokens}</span>
          {agent.defaultModel && <span>🧠 {agent.defaultModel.name}</span>}
        </div>
      </div>
      {isSelected && <Check size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
    </button>
  )
}

function CreateAgentForm({ models, onClose, onCreate }: {
  models: AIModel[]
  onClose: () => void
  onCreate: (data: any) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [avatar, setAvatar] = useState('🤖')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [personality, setPersonality] = useState('professional')
  const [defaultModelId, setDefaultModelId] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2000)
  const [submitting, setSubmitting] = useState(false)

  const avatarOptions = ['🤖', '👨‍💻', '👩‍💻', '🔍', '✍️', '📊', '📈', '🎨', '📝', '🧑‍🔬', '🧑‍💼', '🦾', '💡', '🎯', '🛡️', '⚡']

  const handleSubmit = async () => {
    if (!name || !role || !systemPrompt) return
    setSubmitting(true)
    try {
      await onCreate({ name, role, avatar, description, systemPrompt, personality, defaultModelId: defaultModelId || undefined, temperature, maxTokens })
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px',
    backgroundColor: 'var(--chat-hover)', border: '1px solid var(--chat-border)',
    borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block',
  }

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 50,
      marginTop: '4px', width: 'min(380px, calc(100vw - 24px))',
      backgroundColor: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
      borderRadius: '12px', padding: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      maxHeight: '500px', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Hire New Employee</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px' }}>
          <X size={16} />
        </button>
      </div>

      {/* Avatar picker */}
      <label style={labelStyle}>Avatar</label>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {avatarOptions.map((a) => (
          <button key={a} onClick={() => setAvatar(a)}
            style={{
              width: '32px', height: '32px', borderRadius: '8px', fontSize: '16px',
              border: avatar === a ? '2px solid var(--color-primary)' : '1px solid var(--chat-border)',
              backgroundColor: avatar === a ? 'var(--color-primary-light)' : 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {a}
          </button>
        ))}
      </div>

      {/* Name + Role */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Max" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Role *</label>
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Backend Dev" style={inputStyle} />
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of what they do" style={inputStyle} />
      </div>

      {/* System Prompt */}
      <div style={{ marginBottom: '12px' }}>
        <label style={labelStyle}>System Prompt *</label>
        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a senior developer who..."
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {/* Personality + Model */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <div>
          <label style={labelStyle}>Personality</label>
          <select value={personality} onChange={(e) => setPersonality(e.target.value)} style={inputStyle}>
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="strict">Strict</option>
            <option value="creative">Creative</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Default Model</label>
          <select value={defaultModelId} onChange={(e) => setDefaultModelId(e.target.value)} style={inputStyle}>
            <option value="">User's choice</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Temperature + Max Tokens */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
        <div>
          <label style={labelStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Thermometer size={10} /> Temperature: {temperature}
            </span>
          </label>
          <input type="range" min={0} max={1} step={0.1} value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--color-text-dim)' }}>
            <span>Precise</span><span>Creative</span>
          </div>
        </div>
        <div>
          <label style={labelStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Hash size={10} /> Max Tokens
            </span>
          </label>
          <input type="number" min={100} max={8000} step={100} value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2000)}
            style={inputStyle} />
        </div>
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} disabled={submitting || !name || !role || !systemPrompt}
        style={{
          width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
          backgroundColor: (!name || !role || !systemPrompt) ? 'var(--chat-border)' : 'var(--color-primary)',
          color: (!name || !role || !systemPrompt) ? 'var(--color-text-dim)' : 'white',
          fontSize: '13px', fontWeight: 600, cursor: (!name || !role || !systemPrompt) ? 'not-allowed' : 'pointer',
          transition: 'all 150ms',
        }}>
        {submitting ? 'Hiring...' : `Hire ${name || 'Employee'}`}
      </button>
    </div>
  )
}
