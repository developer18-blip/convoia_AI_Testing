import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { MessageArea } from '../../components/chat/MessageArea'
import { MessageInput } from '../../components/chat/MessageInput'
import { useChat } from '../../hooks/useChat'
import { useModels } from '../../hooks/useModels'
import { useAgents } from '../../hooks/useAgents'
import { useAuth } from '../../hooks/useAuth'
import { useTokens } from '../../contexts/TokenContext'
import { useToast } from '../../hooks/useToast'
import { Menu, Plus, X, Clock, ChevronDown, Sparkles } from 'lucide-react'
import type { Agent, Message } from '../../types'

export function MobileChatPage() {
  const { models } = useModels()
  const { agents } = useAgents()
  const { user: authUser } = useAuth()
  const { tokenBalance, hasTokens } = useTokens()
  const toast = useToast()
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

  // Auto-select first model
  useEffect(() => {
    if (models.length > 0 && !selectedModelId) setSelectedModelId(models[0].id)
  }, [models, selectedModelId])

  // When agent is selected (from MobileAgentsPage), auto-select its default model
  useEffect(() => {
    if (selectedAgent?.defaultModelId) {
      setSelectedModelId(selectedAgent.defaultModelId)
    }
  }, [selectedAgent])

  const selectedModel = models.find((m) => m.id === selectedModelId) || null
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
    if (!selectedModelId) { toast.error('Please select a model'); return }
    if (tokenBalance <= 0) {
      toast.error(authUser?.organizationId ? 'No tokens. Contact your admin.' : 'No tokens remaining.')
      return
    }
    if (!activeConversationId) {
      createConversation(selectedModelId, selectedModel?.name || 'AI')
    }
    await sendMessage(content, selectedModelId, undefined, selectedAgent?.id, thinkingEnabled)
  }

  const handleSendWithContext = (text: string, systemContext: string | null, extras?: any) => {
    if (!activeConversationId) createConversation(selectedModelId, selectedModel?.name || 'AI')
    const messageExtras: Partial<Message> = {}
    if (extras?.fileAttachment) messageExtras.fileAttachment = extras.fileAttachment
    if (extras?.imagePreview) messageExtras.imagePreview = extras.imagePreview
    if (extras?.imagePreviews) messageExtras.imagePreviews = extras.imagePreviews
    sendWithContext(text, selectedModelId, systemContext, messageExtras, undefined, selectedAgent?.id, thinkingEnabled)
  }

  const handleImageGenerated = (data: { url: string; prompt: string }) => {
    if (!activeConversationId) createConversation(selectedModelId, selectedModel?.name || 'AI')
    addMessages([
      { id: uuidv4(), role: 'user', content: `Generate image: ${data.prompt}`, timestamp: new Date().toISOString() },
      { id: uuidv4(), role: 'assistant', content: `Here's the generated image for: "${data.prompt}"`, imageUrl: data.url, imagePrompt: data.prompt, model: 'dall-e-3', provider: 'openai', timestamp: new Date().toISOString() },
    ])
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100dvh - env(safe-area-inset-top, 0px) - 60px - env(safe-area-inset-bottom, 0px))',
      background: 'var(--chat-bg)',
    }}>
      {/* History drawer */}
      {showHistory && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }} onClick={() => setShowHistory(false)} />
          <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: 'min(300px, 80vw)', zIndex: 70, background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
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
              {conversations.filter(c => c.messages?.length > 0).map(conv => (
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
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90, background: 'var(--color-surface)', borderRadius: '24px 24px 0 0', maxHeight: '60vh', display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
                    background: selectedModelId === m.id ? 'var(--color-primary-light)' : 'transparent',
                  }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{m.name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{m.provider}</p>
                  </div>
                  {selectedModelId === m.id && (
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90, background: 'var(--color-surface)', borderRadius: '24px 24px 0 0', maxHeight: '65vh', display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
      <div style={{ flexShrink: 0, padding: '10px 12px 8px', borderBottom: '1px solid var(--color-border)' }}>
        {/* Row 1: Menu, title, actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setShowHistory(true)}
              style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <Menu size={18} />
            </button>
            <h1 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
              {activeConversationId ? (conversations.find(c => c.id === activeConversationId)?.title || 'Chat') : 'New chat'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => {
                const next = !thinkingEnabled
                setThinkingEnabled(next)
                if (next) toast.warning('Thinking mode ON — uses 2x tokens per message')
              }}
              style={{ padding: '5px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: thinkingEnabled ? '#7C3AED' : 'var(--color-surface-2)', color: thinkingEnabled ? 'white' : 'var(--color-text-muted)' }}>
              🧠
            </button>
            <button onClick={() => { setActiveConversation(null); setSelectedAgent(null); setAgentMode(false) }}
              style={{ padding: '5px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={13} />
            </button>
          </div>
        </div>

        {/* Row 2: Model + Agent selectors */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Model selector button */}
          <button onClick={() => setShowModelPicker(true)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: '12px', border: '1.5px solid var(--color-border)',
              background: 'var(--color-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', minWidth: 0,
            }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {selectedModel?.name || 'Select model'}
              </span>
            </div>
            <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />
          </button>

          {/* Agent selector button */}
          <button onClick={() => setShowAgentPicker(true)}
            style={{
              padding: '8px 12px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              border: selectedAgent ? '1.5px solid #7C3AED' : '1.5px solid var(--color-border)',
              background: selectedAgent ? 'rgba(124,58,237,0.08)' : 'var(--color-surface)',
              whiteSpace: 'nowrap',
            }}>
            {selectedAgent ? (
              <>
                <span style={{ fontSize: '14px' }}>{selectedAgent.avatar}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#7C3AED', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedAgent.name}
                </span>
              </>
            ) : (
              <>
                <Sparkles size={13} style={{ color: 'var(--color-text-muted)' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Agent</span>
              </>
            )}
            <ChevronDown size={12} style={{ color: selectedAgent ? '#7C3AED' : 'var(--color-text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Active agent banner */}
      {selectedAgent && (
        <div style={{
          flexShrink: 0, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(124,58,237,0.06)', borderBottom: '1px solid rgba(124,58,237,0.12)',
        }}>
          <span style={{ fontSize: '18px' }}>{selectedAgent.avatar}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#7C3AED', margin: 0 }}>{selectedAgent.name}</p>
            <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedAgent.role}
            </p>
          </div>
          <button onClick={() => handleAgentSelect(null)}
            style={{ padding: '4px', borderRadius: '6px', border: 'none', background: 'rgba(124,58,237,0.1)', color: '#7C3AED', cursor: 'pointer' }}>
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
              background: 'linear-gradient(135deg, var(--color-primary-light), rgba(124,58,237,0.05))',
              border: '1px solid rgba(124,58,237,0.15)',
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
            onRetry={() => retryLastMessage(selectedModelId, undefined, selectedAgent?.id)}
            onEditMessage={(id, content) => editAndResend(id, content, selectedModelId, undefined, selectedAgent?.id)}
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

      {/* Input */}
      <div style={{ flexShrink: 0 }}>
        <MessageInput
          onSend={handleSend}
          isLoading={isStreaming}
          disabled={!hasTokens}
          onStop={stopStreaming}
          selectedModelId={selectedModelId}
          onImageGenerated={handleImageGenerated}
          onSendWithContext={handleSendWithContext}
          onError={(msg) => toast.error(msg)}
        />
      </div>
    </div>
  )
}

export default MobileChatPage
