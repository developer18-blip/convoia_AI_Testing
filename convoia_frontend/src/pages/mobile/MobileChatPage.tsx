import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { MessageArea } from '../../components/chat/MessageArea'
import { MessageInput } from '../../components/chat/MessageInput'
import { useChat } from '../../hooks/useChat'
import { useModels } from '../../hooks/useModels'
import { useAgents } from '../../hooks/useAgents'
import { useAuth } from '../../hooks/useAuth'
import { useTokens } from '../../contexts/TokenContext'
import { useToast } from '../../hooks/useToast'
import { ArrowLeft, Brain, Menu, Plus, X, Clock, ChevronDown, Sparkles } from 'lucide-react'
import type { Agent, Message } from '../../types'
import { CouncilChip } from '../../components/council/CouncilChip'
import { CouncilPicker } from '../../components/council/CouncilPicker'
import { useAccent } from '../../contexts/AccentContext'

interface MessageExtras {
  fileAttachment?: Message['fileAttachment']
  imagePreview?: string
  imagePreviews?: string[]
}

export function MobileChatPage() {
  const navigate = useNavigate()
  const { models } = useModels()
  const { agents } = useAgents()
  const { user: authUser } = useAuth()
  const { tokenBalance, hasTokens } = useTokens()
  const toast = useToast()

  // Tab bar is hidden on /chat, so this is the only way back to the rest of
  // the app. Use the router stack when there's history (came from /dashboard
  // etc.); fall back to /dashboard for cold loads / deep links.
  const handleBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate('/dashboard')
  }
  const {
    conversations, activeConversationId, messages, isStreaming, stopStreaming,
    selectedAgent, setSelectedAgent, setAgentMode,
    createConversation, setActiveConversation,
    sendMessage, sendWithContext, editAndResend, deleteMessage, retryLastMessage, addMessages,
  } = useChat()

  const [selectedModelId, setSelectedModelId] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [councilMode, setCouncilMode] = useState(false)
  const [councilModelIds, setCouncilModelIds] = useState<string[]>([])
  const [showCouncilPicker, setShowCouncilPicker] = useState(false)

  // Listen for auto_model events emitted by ChatContext when the router picks a model
  useEffect(() => {
    const handler = (e: Event) => {
      const { modelId } = (e as CustomEvent).detail
      if (modelId) setSelectedModelId(modelId)
    }
    window.addEventListener('convoia:auto_model', handler)
    return () => window.removeEventListener('convoia:auto_model', handler)
  }, [])

  const effectiveSelectedModelId = selectedModelId || selectedAgent?.defaultModelId || models[0]?.id || ''
  const selectedModel = models.find((m) => m.id === effectiveSelectedModelId) || null

  // Sync AccentContext with the active model so chat-surface chrome shifts to
  // the provider's brand color (anthropic orange, openai green, etc).
  const { setActiveModel, setCouncilModels } = useAccent()
  useEffect(() => {
    if (councilMode && councilModelIds.length > 0) {
      setCouncilModels(councilModelIds)
    } else {
      setCouncilModels([])
      const model = models.find((m) => m.id === effectiveSelectedModelId)
      setActiveModel(model?.modelId || effectiveSelectedModelId || '')
    }
  }, [effectiveSelectedModelId, councilMode, councilModelIds, models, setActiveModel, setCouncilModels])
  const activeModels = models.filter(m => m.isActive)
  const activeAgents = agents.filter(a => a.isActive)

  const handleAgentSelect = (agent: Agent | null) => {
    setSelectedAgent(agent)
    setAgentMode(!!agent)
    if (agent?.defaultModelId) setSelectedModelId(agent.defaultModelId)
    setShowAgentPicker(false)
    if (agent) toast.success(`${agent.name} activated`)
  }

  const handleSend = async (content: string) => {
    // Council mode uses councilModelIds; selectedModelId doesn't matter for validation.
    if (!councilMode && !effectiveSelectedModelId) { toast.error('Please select a model'); return }
    if (councilMode && councilModelIds.length < 2) {
      toast.error('Select at least 2 models for Apex')
      return
    }
    if (tokenBalance <= 0) {
      toast.error(authUser?.organizationId ? 'No tokens. Contact your admin.' : 'No tokens remaining.')
      return
    }
    if (!activeConversationId) {
      createConversation(
        councilMode ? councilModelIds[0] : effectiveSelectedModelId,
        councilMode ? 'ConvoiaAI Apex' : (selectedModel?.name || 'AI'),
      )
    }
    const councilOpts = councilMode ? { modelIds: councilModelIds } : undefined
    await sendMessage(
      content,
      councilMode ? councilModelIds[0] : effectiveSelectedModelId,
      undefined,
      selectedAgent?.id,
      thinkingEnabled,
      councilOpts,
    )
  }

  const handleSendWithContext = (text: string, systemContext: string | null, extras?: MessageExtras) => {
    if (!activeConversationId) createConversation(
      councilMode ? councilModelIds[0] : effectiveSelectedModelId,
      councilMode ? 'ConvoiaAI Apex' : (selectedModel?.name || 'AI'),
    )
    const messageExtras: Partial<Message> = {}
    if (extras?.fileAttachment) messageExtras.fileAttachment = extras.fileAttachment
    if (extras?.imagePreview) messageExtras.imagePreview = extras.imagePreview
    if (extras?.imagePreviews) messageExtras.imagePreviews = extras.imagePreviews
    const councilOpts = councilMode ? { modelIds: councilModelIds } : undefined
    sendWithContext(
      text,
      councilMode ? councilModelIds[0] : effectiveSelectedModelId,
      systemContext,
      messageExtras,
      undefined,
      selectedAgent?.id,
      thinkingEnabled,
      councilOpts,
    )
  }

  const handleImageGenerated = (data: { url: string; prompt: string }) => {
    if (!activeConversationId) createConversation(effectiveSelectedModelId, selectedModel?.name || 'AI')
    addMessages([
      { id: uuidv4(), role: 'user', content: `Generate image: ${data.prompt}`, timestamp: new Date().toISOString() },
      { id: uuidv4(), role: 'assistant', content: `Here's the generated image for: "${data.prompt}"`, imageUrl: data.url, imagePrompt: data.prompt, model: 'dall-e-3', provider: 'openai', timestamp: new Date().toISOString() },
    ])
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, minHeight: 0, overflow: 'hidden',
      background: 'var(--chat-bg)',
    }}>
      {/* Council picker — bottom sheet */}
      {showCouncilPicker && (
        <CouncilPicker
          activeModels={activeModels}
          initialSelectedIds={councilModelIds}
          variant="sheet"
          onConfirm={(ids) => {
            setCouncilModelIds(ids)
            setCouncilMode(true)
            setShowCouncilPicker(false)
            toast.success(`Apex activated — ${ids.length} models`)
          }}
          onClose={() => setShowCouncilPicker(false)}
        />
      )}

      {/* History drawer */}
      {showHistory && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }} onClick={() => setShowHistory(false)} />
          <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: 'min(300px, 82vw)', zIndex: 70, background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)', boxShadow: '4px 0 32px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>History</h2>
              <button onClick={() => setShowHistory(false)} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              <button onClick={() => { setActiveConversation(null); setShowHistory(false) }}
                style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px dashed var(--color-border)', background: 'transparent', color: 'var(--color-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                <Plus size={16} /> New Chat
              </button>
              {conversations.filter(c => (c.messages?.length > 0) || (c.title && c.title !== 'New Chat')).map(conv => (
                <button key={conv.id} onClick={() => { setActiveConversation(conv.id); setShowHistory(false) }}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', textAlign: 'left', cursor: 'pointer', marginBottom: '4px',
                    background: conv.id === activeConversationId ? 'var(--color-primary-light)' : 'transparent' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</p>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={10} /> {new Date(conv.updatedAt).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Model picker bottom sheet */}
      {showModelPicker && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80 }} onClick={() => setShowModelPicker(false)} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90, background: 'var(--color-surface)', borderRadius: '24px 24px 0 0', maxHeight: 'calc(var(--vh, 1dvh) * 62)', display: 'flex', flexDirection: 'column', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'var(--color-border)', margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Select Model</h3>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 16px' }}>
              {activeModels.map(m => (
                <button key={m.id} onClick={() => { setSelectedModelId(m.id); setShowModelPicker(false) }}
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: '14px', border: 'none', textAlign: 'left',
                    cursor: 'pointer', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: effectiveSelectedModelId === m.id ? 'var(--color-primary-light)' : 'transparent',
                  }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{m.name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{m.provider}</p>
                  </div>
                  {effectiveSelectedModelId === m.id && (
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'white' }} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Agent picker bottom sheet */}
      {showAgentPicker && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80 }} onClick={() => setShowAgentPicker(false)} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90, background: 'var(--color-surface)', borderRadius: '24px 24px 0 0', maxHeight: 'calc(var(--vh, 1dvh) * 68)', display: 'flex', flexDirection: 'column', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', background: 'var(--color-border)', margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Select Agent</h3>
                {selectedAgent && (
                  <button onClick={() => handleAgentSelect(null)}
                    style={{ fontSize: '13px', fontWeight: 600, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 16px' }}>
              {activeAgents.map(agent => (
                <button key={agent.id} onClick={() => handleAgentSelect(agent)}
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: '14px', border: 'none', textAlign: 'left',
                    cursor: 'pointer', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '12px',
                    background: selectedAgent?.id === agent.id ? 'var(--color-primary-light)' : 'transparent',
                  }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px', background: 'var(--color-surface-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0,
                  }}>
                    {agent.avatar}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{agent.name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agent.role}
                    </p>
                  </div>
                  {selectedAgent?.id === agent.id && (
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'white' }} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Top bar */}
      <div style={{
        flexShrink: 0,
        padding: '12px 14px 10px',
        background: 'var(--mobile-topbar-bg)',
        borderBottom: '1px solid var(--mobile-topbar-border)',
        boxShadow: '0 8px 24px rgba(26,26,46,0.05)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        {/* Row 1: Back, menu, title, actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <button onClick={handleBack} aria-label="Back"
              style={{ width: '38px', height: '38px', borderRadius: '14px', border: '1px solid var(--color-primary-light)', background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ArrowLeft size={18} />
            </button>
            <button onClick={() => setShowHistory(true)} aria-label="Chat history"
              style={{ width: '38px', height: '38px', borderRadius: '14px', border: '1px solid var(--color-primary-light)', background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Menu size={18} />
            </button>
            <h1 style={{ fontSize: '15px', fontWeight: 900, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px', letterSpacing: 0 }}>
              {activeConversationId ? (conversations.find(c => c.id === activeConversationId)?.title || 'Chat') : 'New chat'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => {
                const next = !thinkingEnabled
                setThinkingEnabled(next)
                if (next) toast.warning('Thinking mode ON — uses 2x tokens per message')
              }}
              style={{ width: '38px', height: '38px', borderRadius: '14px', fontSize: '11px', fontWeight: 800, border: 'none', cursor: 'pointer',
                background: thinkingEnabled ? 'var(--color-primary)' : 'var(--color-surface-2)', color: thinkingEnabled ? 'white' : 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Brain size={17} />
            </button>
            <button onClick={() => { setActiveConversation(null); setSelectedAgent(null); setAgentMode(false) }}
              style={{ width: '38px', height: '38px', borderRadius: '14px', fontSize: '11px', fontWeight: 800, border: 'none', cursor: 'pointer', background: 'var(--mobile-newchat-bg)', color: 'var(--mobile-newchat-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={17} />
            </button>
          </div>
        </div>

        {/* Row 2: Horizontal model chips + Agent button */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Scrollable model chips */}
          <div style={{ flex: 1, display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', minWidth: 0 }}>
            {/* Council chip — multi-model consensus */}
            <CouncilChip
              active={councilMode}
              count={councilModelIds.length}
              onClick={() => setShowCouncilPicker(true)}
              variant="mobile"
            />

            {/* Auto chip — always first */}
            <button
              onClick={() => { setCouncilMode(false); setSelectedModelId('auto') }}
              style={{
                padding: '6px 12px', borderRadius: '100px', fontSize: '11px', fontWeight: 700,
                border: effectiveSelectedModelId === 'auto' ? '1.5px solid #10B981' : '1px solid var(--color-border)',
                background: effectiveSelectedModelId === 'auto'
                  ? 'linear-gradient(135deg, #10B981, #059669)'
                  : 'var(--color-surface)',
                color: effectiveSelectedModelId === 'auto' ? 'white' : 'var(--color-text-muted)',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
              <span style={{ fontSize: '11px' }}>✦</span> Auto
            </button>

            {activeModels.slice(0, 8).map(m => {
              const isActive = !councilMode && effectiveSelectedModelId === m.id
              const shortName = m.name.replace('Claude ', '').replace('Gemini ', '').replace('GPT-', 'GPT ').replace(' (Groq)', '')
              return (
                <button key={m.id} onClick={() => { setCouncilMode(false); setSelectedModelId(m.id) }}
                  style={{
                    padding: '6px 12px', borderRadius: '100px', fontSize: '11px', fontWeight: 600,
                  border: isActive ? '1.5px solid var(--color-primary)' : '1px solid var(--color-primary-glow)',
                    background: isActive ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: isActive ? 'white' : 'var(--color-text-muted)',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                  {shortName}
                </button>
              )
            })}
            {activeModels.length > 8 && (
              <button onClick={() => setShowModelPicker(true)}
                style={{
                  padding: '6px 12px', borderRadius: '100px', fontSize: '11px', fontWeight: 600,
                  border: '1px solid var(--color-primary-glow)', background: 'var(--color-surface)',
                  color: 'var(--color-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                More...
              </button>
            )}
          </div>

          {/* Agent selector button */}
          <button onClick={() => setShowAgentPicker(true)}
            style={{
              padding: '6px 10px', borderRadius: '100px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
              border: selectedAgent ? '1.5px solid var(--color-primary)' : '1px solid var(--color-primary-glow)',
              background: selectedAgent ? 'var(--color-primary-light)' : 'var(--color-surface)',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
            {selectedAgent ? (
              <span style={{ fontSize: '12px' }}>{selectedAgent.avatar}</span>
            ) : (
              <Sparkles size={12} style={{ color: 'var(--color-text-muted)' }} />
            )}
            <ChevronDown size={10} style={{ color: selectedAgent ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Active agent banner */}
      {selectedAgent && (
        <div style={{
          flexShrink: 0, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '10px',
          background: 'var(--color-primary-light)', borderBottom: '1px solid var(--color-primary-glow)',
        }}>
          <span style={{ fontSize: '18px' }}>{selectedAgent.avatar}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>{selectedAgent.name}</p>
            <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedAgent.role}
            </p>
          </div>
          <button onClick={() => handleAgentSelect(null)}
            style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'var(--color-primary-light)', color: 'var(--color-primary)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px', textAlign: 'center', background: 'var(--chat-bg)' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px', marginBottom: '16px',
              background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-primary-light))',
              border: '1px solid var(--color-primary-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', color: 'var(--color-primary)',
            }}>
              {selectedAgent ? selectedAgent.avatar : '✦'}
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 6px' }}>
              {selectedAgent ? `Chat with ${selectedAgent.name}` : 'Start a conversation'}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0, maxWidth: '260px' }}>
              {selectedAgent
                ? selectedAgent.description || selectedAgent.role
                : `Type a message below to chat with ${selectedModel?.name || 'AI'}`}
            </p>
          </div>
        ) : (
          <MessageArea
            messages={messages}
            isLoading={isStreaming}
            onRetry={() => retryLastMessage(effectiveSelectedModelId, undefined, selectedAgent?.id)}
            onEditMessage={(id, content) => editAndResend(id, content, effectiveSelectedModelId, undefined, selectedAgent?.id)}
            onDeleteMessage={deleteMessage}
          />
        )}
      </div>

      {/* No tokens banner */}
      {!hasTokens && (
        <div style={{ padding: '6px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 500, background: 'rgba(239,68,68,0.08)', color: '#EF4444', flexShrink: 0 }}>
          No tokens remaining.
        </div>
      )}

      {/* Input — tab bar is hidden on /chat, so we only pad for the home
          indicator (env returns ~0 once the keyboard is up). */}
      <div style={{ flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <MessageInput
          onSend={handleSend}
          isLoading={isStreaming}
          disabled={!hasTokens}
          onStop={stopStreaming}
          selectedModelId={effectiveSelectedModelId}
          onImageGenerated={handleImageGenerated}
          onSendWithContext={handleSendWithContext}
          onError={(msg) => toast.error(msg)}
        />
      </div>
    </div>
  )
}

export default MobileChatPage
