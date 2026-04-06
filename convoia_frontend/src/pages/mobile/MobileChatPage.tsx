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
import { MoreHorizontal, Plus, X, Clock } from 'lucide-react'
import type { Message } from '../../types'

export function MobileChatPage() {
  const { models } = useModels()
  useAgents()
  const { user: authUser } = useAuth()
  const { tokenBalance, hasTokens } = useTokens()
  const toast = useToast()
  const {
    conversations, activeConversationId, messages, isStreaming, stopStreaming,
    createConversation, setActiveConversation,
    sendMessage, sendWithContext, editAndResend, deleteMessage, retryLastMessage, addMessages,
  } = useChat()

  const [selectedModelId, setSelectedModelId] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (models.length > 0 && !selectedModelId) setSelectedModelId(models[0].id)
  }, [models, selectedModelId])

  const selectedModel = models.find((m) => m.id === selectedModelId) || null

  const handleSend = async (content: string) => {
    if (!selectedModelId) { toast.error('Please select a model'); return }
    if (tokenBalance <= 0) {
      toast.error(authUser?.organizationId ? 'No tokens. Contact your admin.' : 'No tokens remaining.')
      return
    }
    let convId = activeConversationId
    if (!convId) {
      const conv = createConversation(selectedModelId, selectedModel?.name || 'AI')
      convId = conv.id
    }
    await sendMessage(content, selectedModelId, undefined, undefined, thinkingEnabled)
  }

  const handleSendWithContext = (text: string, systemContext: string | null, extras?: any) => {
    if (!activeConversationId) createConversation(selectedModelId, selectedModel?.name || 'AI')
    const messageExtras: Partial<Message> = {}
    if (extras?.fileAttachment) messageExtras.fileAttachment = extras.fileAttachment
    if (extras?.imagePreview) messageExtras.imagePreview = extras.imagePreview
    if (extras?.imagePreviews) messageExtras.imagePreviews = extras.imagePreviews
    sendWithContext(text, selectedModelId, systemContext, messageExtras, undefined, undefined, thinkingEnabled)
  }

  const handleImageGenerated = (data: { url: string; prompt: string }) => {
    if (!activeConversationId) createConversation(selectedModelId, selectedModel?.name || 'AI')
    const userMsg: Message = { id: uuidv4(), role: 'user', content: `Generate image: ${data.prompt}`, timestamp: new Date().toISOString() }
    const assistantMsg: Message = { id: uuidv4(), role: 'assistant', content: `Here's the generated image for: "${data.prompt}"`, imageUrl: data.url, imagePrompt: data.prompt, model: 'dall-e-3', provider: 'openai', timestamp: new Date().toISOString() }
    addMessages([userMsg, assistantMsg])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--chat-bg)' }}>
      {/* History drawer overlay */}
      {showHistory && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }} onClick={() => setShowHistory(false)} />
          <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: 'min(300px, 80vw)', zIndex: 70, background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Chat History</h2>
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
                  style={{
                    width: '100%', padding: '12px', borderRadius: '12px', border: 'none', textAlign: 'left', cursor: 'pointer', marginBottom: '4px',
                    background: conv.id === activeConversationId ? 'var(--color-primary-light)' : 'transparent',
                    transition: 'background 150ms',
                  }}>
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

      {/* Top bar */}
      <div style={{ flexShrink: 0, padding: '12px 16px 8px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => setShowHistory(true)}
              style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <MoreHorizontal size={18} />
            </button>
            <h1 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
              {activeConversationId ? (conversations.find(c => c.id === activeConversationId)?.title || 'Chat') : 'New chat'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setThinkingEnabled(!thinkingEnabled)}
              style={{ padding: '6px 12px', borderRadius: '14px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: thinkingEnabled ? '#7C3AED' : 'var(--color-surface-2)', color: thinkingEnabled ? 'white' : 'var(--color-text-muted)' }}>
              🧠 Think
            </button>
            <button onClick={() => setActiveConversation(null)}
              style={{ padding: '6px 12px', borderRadius: '14px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}>
              <Plus size={14} /> New
            </button>
          </div>
        </div>

        {/* Model pills */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
          {models.filter(m => m.isActive).slice(0, 8).map(m => (
            <button key={m.id} onClick={() => setSelectedModelId(m.id)}
              style={{
                padding: '6px 14px', borderRadius: '16px', fontSize: '12px', fontWeight: 600,
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                background: selectedModelId === m.id ? '#7C3AED' : 'var(--color-surface-2)',
                color: selectedModelId === m.id ? 'white' : 'var(--color-text-secondary)',
              }}>
              {m.name.replace('Claude ', '').replace('Gemini ', '').replace('GPT-', 'GPT ')}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <MessageArea
          messages={messages}
          isLoading={isStreaming}
          onRetry={() => retryLastMessage(selectedModelId, undefined, undefined)}
          onSuggestedPrompt={handleSend}
          onEditMessage={(id, content) => editAndResend(id, content, selectedModelId, undefined, undefined)}
          onDeleteMessage={deleteMessage}
        />
      </div>

      {/* No tokens banner */}
      {!hasTokens && (
        <div style={{ padding: '8px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 500, background: 'rgba(239,68,68,0.08)', color: '#EF4444', borderTop: '1px solid rgba(239,68,68,0.15)' }}>
          No tokens remaining. Buy tokens to continue.
        </div>
      )}

      {/* Input */}
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
  )
}

export default MobileChatPage
