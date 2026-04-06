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
import { MoreHorizontal } from 'lucide-react'
import type { Message } from '../../types'

export function MobileChatPage() {
  const { models } = useModels()
  useAgents() // preload agents for the system
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
      {/* Top bar: model pills */}
      <div style={{ flexShrink: 0, padding: '12px 16px 8px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {activeConversationId ? (conversations.find(c => c.id === activeConversationId)?.title || 'Chat') : 'New chat'}
          </h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setThinkingEnabled(!thinkingEnabled)}
              style={{ padding: '6px 12px', borderRadius: '14px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
                background: thinkingEnabled ? '#7C3AED' : 'var(--color-surface-2)', color: thinkingEnabled ? 'white' : 'var(--color-text-muted)' }}>
              🧠 Think
            </button>
            <button onClick={() => setActiveConversation(null)}
              style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>

        {/* Model pills — horizontally scrollable */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
          {models.filter(m => m.isActive).slice(0, 8).map(m => (
            <button key={m.id} onClick={() => { setSelectedModelId(m.id); toast.info(`${m.name} selected`) }}
              style={{
                padding: '6px 14px', borderRadius: '16px', fontSize: '12px', fontWeight: 600,
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                background: selectedModelId === m.id ? '#7C3AED' : 'var(--color-surface-2)',
                color: selectedModelId === m.id ? 'white' : 'var(--color-text-secondary)',
                transition: 'all 150ms',
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
