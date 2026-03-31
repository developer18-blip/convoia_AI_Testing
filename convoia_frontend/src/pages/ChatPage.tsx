import { useEffect, useRef, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ConversationList } from '../components/chat/ConversationList'
import { MessageArea } from '../components/chat/MessageArea'
import { MessageInput } from '../components/chat/MessageInput'
import { CodeInterpreter } from '../components/chat/CodeInterpreter'
import { CanvasPanel } from '../components/chat/CanvasPanel'
import { CostEstimator } from '../components/chat/CostEstimator'
import { ModelSelector } from '../components/shared/ModelSelector'
import { AgentSelector } from '../components/shared/AgentSelector'
import { useChat } from '../hooks/useChat'
import type { Agent, Message, CanvasItem } from '../types'
import { useModels } from '../hooks/useModels'
import { useAgents } from '../hooks/useAgents'
import { useToast } from '../hooks/useToast'
import { useAuth } from '../hooks/useAuth'
import { useTokens } from '../contexts/TokenContext'
import { formatTokens } from '../lib/utils'
import {
  Zap, PanelLeftClose, PanelLeft,
  MoreHorizontal, Trash2, Download, Menu,
} from 'lucide-react'

export function ChatPage() {
  const { models } = useModels()
  const { agents, createAgent } = useAgents()
  const { user: authUser } = useAuth()
  const { tokenBalance, formattedBalance } = useTokens()
  const toast = useToast()
  const {
    conversations, folders, activeConversationId, activeConversation, messages, isStreaming, stopStreaming,
    setAgentMode,
    createConversation, deleteConversation, setActiveConversation,
    renameConversation, togglePin, moveToFolder, createFolder, deleteFolder,
    sendMessage, sendWithContext, editAndResend, deleteMessage, clearMessages, retryLastMessage, addMessages,
  } = useChat()

  const [selectedModelId, setSelectedModelId] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [lastResponseModel, setLastResponseModel] = useState<string | null>(null)
  const prevStreaming = useRef(false)
  // Image generation is handled by backend intent detection
  const [industry, setIndustry] = useState('')
  const [thinkingEnabled, setThinkingEnabled] = useState(false)
  const [leftOpen, setLeftOpen] = useState(true)
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [codeInterpreter, setCodeInterpreter] = useState<{ code: string; language: string } | null>(null)

  // Canvas state
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([])
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null)
  const canvasOpen = canvasItems.length > 0

  useEffect(() => {
    if (window.innerWidth < 768) setLeftOpen(false)
  }, [])

  // Update model badge when a response finishes
  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
      if (lastAssistant?.model) setLastResponseModel(lastAssistant.model)
    }
    prevStreaming.current = isStreaming
  }, [isStreaming, messages])

  const handleModelChange = (id: string) => {
    setSelectedModelId(id)
    const model = models.find((m) => m.id === id)
    if (model) toast.info(`${model.name} is running`)
  }

  useEffect(() => {
    if (models.length > 0 && !selectedModelId) setSelectedModelId(models[0].id)
  }, [models, selectedModelId])

  useEffect(() => {
    if (activeConversation) {
      setSelectedModelId(activeConversation.modelId)
      if (activeConversation.industry) setIndustry(activeConversation.industry)
    }
  }, [activeConversationId])

  const handleAgentChange = (agent: Agent | null) => {
    setSelectedAgent(agent)
    setAgentMode(!!agent)
    if (agent?.defaultModelId) {
      setSelectedModelId(agent.defaultModelId)
    }
    if (agent?.industry) {
      setIndustry(agent.industry)
    }
    // Keep the current conversation — agent switch just changes the system prompt
    // for the next message, not the conversation itself
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); handleNew() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const selectedModel = models.find((m) => m.id === selectedModelId) || null

  const handleSend = async (content: string) => {
    // Ensure a model is selected
    if (!selectedModelId) {
      toast.error('Please select a model first. If models are not loading, check your connection.')
      return
    }

    // Pre-flight token check
    if (tokenBalance <= 0) {
      const isOrgMember = !!authUser?.organizationId
      const isOwner = authUser?.role === 'org_owner'
      if (isOrgMember && !isOwner) {
        toast.error('No tokens remaining. Contact your manager for more tokens.')
      } else {
        toast.error('No tokens remaining. Purchase more tokens to continue.')
      }
      return
    }

    // Image generation is now handled automatically by the backend
    // via intent detection in the streaming endpoint. No frontend detection needed.

    const estimated = Math.ceil(content.length / 4) + 500
    if (tokenBalance < estimated) {
      toast.warning(`Low token balance: ${formattedBalance} remaining. This message may fail.`)
      // Still allow — backend will do the final check
    }

    let convId = activeConversationId
    if (!convId) {
      const conv = createConversation(selectedModelId, selectedModel?.name || 'AI', industry || undefined)
      convId = conv.id
    }
    await sendMessage(content, selectedModelId, industry || undefined, selectedAgent?.id, thinkingEnabled)
  }

  const handleNew = () => setActiveConversation(null)

  const handleDelete = (id: string) => {
    deleteConversation(id)
    toast.success('Conversation deleted')
  }

  const handleEditMessage = (id: string, content: string) => {
    editAndResend(id, content, selectedModelId, industry || undefined, selectedAgent?.id)
  }

  const handleRunCode = (code: string, language: string) => {
    setCodeInterpreter({ code, language })
  }

  // Canvas handlers
  const handleOpenInCanvas = useCallback((content: string, language: string, type: 'code' | 'text') => {
    // Check if this exact content already exists in canvas
    const existing = canvasItems.find(i => i.content === content && i.type === type)
    if (existing) {
      setActiveCanvasId(existing.id)
      return
    }

    const title = type === 'code'
      ? `${(language || 'code').charAt(0).toUpperCase() + (language || 'code').slice(1)} snippet`
      : content.split('\n')[0]?.slice(0, 50).replace(/^#+\s*/, '') || 'Document'

    const item: CanvasItem = {
      id: uuidv4(),
      type,
      title,
      content,
      language: type === 'code' ? language : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setCanvasItems(prev => [...prev, item])
    setActiveCanvasId(item.id)
  }, [canvasItems])

  const handleUpdateCanvasItem = useCallback((id: string, content: string) => {
    setCanvasItems(prev => prev.map(i =>
      i.id === id ? { ...i, content, updatedAt: new Date().toISOString() } : i
    ))
  }, [])

  const handleRemoveCanvasItem = useCallback((id: string) => {
    setCanvasItems(prev => {
      const next = prev.filter(i => i.id !== id)
      if (activeCanvasId === id) {
        setActiveCanvasId(next.length > 0 ? next[next.length - 1].id : null)
      }
      return next
    })
  }, [activeCanvasId])

  const handleCloseCanvas = useCallback(() => {
    setCanvasItems([])
    setActiveCanvasId(null)
  }, [])

  const handleInsertToChat = useCallback((content: string) => {
    handleSend(content)
  }, [activeConversationId, selectedModelId, industry, selectedAgent])

  const handleFileProcessed = (data: {
    userContent: string; assistantContent: string; cost: number
    tokens: { input: number; output: number }
    imagePreview?: string
    fileAttachment?: { name: string; type: 'image' | 'document' | 'audio' | 'video'; size: number }
    model?: string; provider?: string
  }) => {
    if (!data?.assistantContent && !data?.userContent) return
    if (!activeConversationId) {
      createConversation(selectedModelId, selectedModel?.name || 'AI', industry || undefined)
    }
    const userMsg: Message = {
      id: uuidv4(), role: 'user', content: data.userContent,
      timestamp: new Date().toISOString(), imagePreview: data.imagePreview, fileAttachment: data.fileAttachment,
    }
    const assistantMsg: Message = {
      id: uuidv4(), role: 'assistant', content: data.assistantContent,
      tokensInput: data.tokens.input, tokensOutput: data.tokens.output, cost: data.cost,
      model: data.model || selectedModel?.name || 'AI (Vision)',
      provider: data.provider || selectedModel?.provider || '',
      timestamp: new Date().toISOString(),
    }
    addMessages([userMsg, assistantMsg])
  }

  const handleImageGenerated = (data: { url: string; prompt: string }) => {
    if (!activeConversationId) {
      createConversation(selectedModelId, selectedModel?.name || 'AI', industry || undefined)
    }
    const userMsg: Message = {
      id: uuidv4(), role: 'user', content: `Generate image: ${data.prompt}`, timestamp: new Date().toISOString(),
    }
    const assistantMsg: Message = {
      id: uuidv4(), role: 'assistant', content: `Here's the generated image for: "${data.prompt}"`,
      imageUrl: data.url, imagePrompt: data.prompt, model: 'dall-e-3', provider: 'openai', timestamp: new Date().toISOString(),
    }
    addMessages([userMsg, assistantMsg])
  }

  const handleSendWithContext = (text: string, systemContext: string | null, extras?: { fileAttachment?: { name: string; type: 'image' | 'document' | 'audio' | 'video'; size: number }; imagePreview?: string }) => {
    if (!activeConversationId) {
      createConversation(selectedModelId, selectedModel?.name || 'AI', industry || undefined)
    }
    const messageExtras: Partial<Message> = {}
    if (extras?.fileAttachment) messageExtras.fileAttachment = extras.fileAttachment
    if (extras?.imagePreview) messageExtras.imagePreview = extras.imagePreview
    sendWithContext(text, selectedModelId, systemContext, messageExtras, industry || undefined, selectedAgent?.id, thinkingEnabled)
  }

  const handleExport = () => {
    if (!activeConversation) return
    const format = messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n---\n\n')
    const blob = new Blob([format], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeConversation.title.replace(/\s+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
    setShowMoreMenu(false)
    toast.success('Conversation exported')
  }

  const handleClear = () => {
    clearMessages()
    setShowMoreMenu(false)
    toast.success('Conversation cleared')
  }

  const industries = [
    { value: '', label: 'General' },
    { value: 'legal', label: 'Legal' },
    { value: 'healthcare', label: 'Healthcare' },
    { value: 'finance', label: 'Finance' },
    { value: 'hr', label: 'HR' },
    { value: 'marketing', label: 'Marketing' },
  ]

  const totalTokens = messages.reduce((s, m) => s + (m.tokensInput || 0) + (m.tokensOutput || 0), 0)
  const totalCost = messages.reduce((s, m) => s + (m.cost || 0), 0)

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', margin: '-16px', overflow: 'hidden', backgroundColor: 'var(--chat-bg)', color: 'var(--chat-text)', fontFamily: "'Inter', sans-serif" }}>

      {/* LEFT PANEL — Desktop sidebar */}
      <div
        className="hidden md:flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out"
        style={{ width: leftOpen ? '260px' : '0px' }}
      >
        <ConversationList
          conversations={conversations} folders={folders} activeId={activeConversationId}
          onSelect={(id) => setActiveConversation(id)} onNew={handleNew} onDelete={handleDelete}
          onRename={renameConversation} onTogglePin={togglePin} onMoveToFolder={moveToFolder}
          onCreateFolder={createFolder} onDeleteFolder={deleteFolder}
        />
      </div>

      {/* LEFT PANEL — Mobile overlay */}
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-300 md:hidden ${
          mobileLeftOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={() => setMobileLeftOpen(false)}
      />
      <div
        className="fixed left-0 z-40 flex flex-col transition-transform duration-300 ease-in-out md:hidden"
        style={{ top: '56px', height: 'calc(100% - 56px)', width: 'min(280px, calc(100vw - 48px))', background: 'var(--color-surface)', transform: mobileLeftOpen ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <ConversationList
          conversations={conversations} folders={folders} activeId={activeConversationId}
          onSelect={(id) => { setActiveConversation(id); setMobileLeftOpen(false) }}
          onNew={() => { handleNew(); setMobileLeftOpen(false) }}
          onDelete={handleDelete} onRename={renameConversation} onTogglePin={togglePin}
          onMoveToFolder={moveToFolder} onCreateFolder={createFolder} onDeleteFolder={deleteFolder}
        />
      </div>

      {/* CENTER PANEL — main chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--chat-bg)', minWidth: 0 }}>
        {/* Top bar — clean, no border like ChatGPT */}
        <div className="flex items-center gap-2" style={{
          height: '48px', padding: '0 16px', flexShrink: 0,
          backgroundColor: 'var(--chat-bg)',
        }}>
          {/* Mobile hamburger */}
          <button onClick={() => setMobileLeftOpen(true)} className="md:hidden"
            style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <Menu size={18} />
          </button>
          {/* Desktop sidebar toggle */}
          <button onClick={() => setLeftOpen(!leftOpen)} className="hidden md:flex" title={leftOpen ? 'Hide conversations' : 'Show conversations'}
            style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', transition: 'all 150ms' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-surface)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-muted)' }}>
            {leftOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>

          {/* Model selector — ChatGPT style text */}
          {models.length > 0 ? (
            <ModelSelector models={models} selectedId={selectedModelId} onChange={handleModelChange} />
          ) : (
            <span style={{ fontSize: '14px', color: 'var(--chat-text-muted)', padding: '6px 8px' }}>
              Loading models...
            </span>
          )}

          {/* Industry — hidden on mobile */}
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="hidden lg:block"
            style={{ padding: '6px 10px', backgroundColor: 'var(--chat-surface)', border: '1px solid var(--chat-border)', borderRadius: '8px', color: 'var(--color-text-secondary)', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
          >
            {industries.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>

          {/* Agent selector — hidden on small mobile */}
          <div className="hidden sm:block">
            <AgentSelector
              agents={agents}
              models={models}
              selectedId={selectedAgent?.id || null}
              onChange={handleAgentChange}
              onCreateAgent={createAgent}
            />
          </div>

          {/* Think toggle — compact on mobile */}
          <button
            onClick={() => setThinkingEnabled(!thinkingEnabled)}
            title={thinkingEnabled ? 'Extended thinking ON — deeper reasoning' : 'Enable extended thinking'}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', transition: 'all 200ms', flexShrink: 0,
              background: thinkingEnabled ? 'var(--color-primary)' : 'var(--chat-surface)',
              color: thinkingEnabled ? 'white' : 'var(--chat-text-muted)',
              border: thinkingEnabled ? '1px solid var(--color-primary)' : '1px solid var(--chat-border)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a8 8 0 0 0-8 8c0 3.5 2 6 4 7.5V20h8v-2.5c2-1.5 4-4 4-7.5a8 8 0 0 0-8-8z"/>
              <path d="M9 20h6v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1z"/>
              {thinkingEnabled && <path d="M12 6v4l2 2" stroke="currentColor" strokeWidth="1.5"/>}
            </svg>
            <span className="hidden sm:inline">Think</span>
          </button>

          <div className="ml-auto flex items-center gap-1 sm:gap-3 shrink-0">
            {/* Per-conversation cost — live updating */}
            {totalCost > 0 && (
              <div className="hidden md:flex items-center gap-1" style={{ fontSize: '11px', color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>
                <span>$</span>
                <span style={{ color: 'var(--color-text-muted)' }}>~${totalCost.toFixed(4)}/query</span>
              </div>
            )}
            {!totalCost && (
              <div className="hidden md:block"><CostEstimator model={selectedModel} /></div>
            )}

            {/* Per-conversation token usage — live updating */}
            <div className="flex items-center gap-1" style={{
              fontSize: '12px', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
              color: totalTokens > 0 ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
              padding: '3px 8px', borderRadius: '6px',
              background: totalTokens > 0 ? 'var(--color-primary-light)' : 'transparent',
              transition: 'all 0.3s',
            }}>
              <Zap size={11} style={{ color: '#A78BFA' }} />
              <span className="hidden sm:inline">
                {totalTokens > 0 ? formatTokens(totalTokens) : formattedBalance}
              </span>
            </div>

            {/* More menu */}
            <div className="relative">
              <button onClick={() => setShowMoreMenu(!showMoreMenu)}
                style={{ padding: '6px', borderRadius: '8px', backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', transition: 'all 150ms' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--chat-surface)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-muted)' }}>
                <MoreHorizontal size={16} />
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 top-full z-50" style={{ marginTop: '4px', background: 'var(--chat-surface)', border: '1px solid var(--chat-border)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '4px 0', minWidth: '180px' }}>
                  <button onClick={handleClear} className="w-full flex items-center gap-2"
                    style={{ padding: '8px 12px', fontSize: '13px', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', transition: 'all 150ms' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--chat-border)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}>
                    <Trash2 size={14} /> Clear conversation
                  </button>
                  <button onClick={handleExport} className="w-full flex items-center gap-2"
                    style={{ padding: '8px 12px', fontSize: '13px', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', transition: 'all 150ms' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--chat-border)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}>
                    <Download size={14} /> Export (Markdown)
                  </button>
                  <div style={{ borderTop: '1px solid var(--chat-border)', margin: '4px 0' }} />
                  <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
                    <p style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-muted)' }}>Shortcuts</p>
                    <p style={{ margin: '1px 0' }}>Ctrl+N — New chat</p>
                    <p style={{ margin: '1px 0' }}>Enter — Send</p>
                    <p style={{ margin: '1px 0' }}>Shift+Enter — New line</p>
                  </div>

                  {/* Session stats */}
                  {messages.length > 0 && (
                    <>
                      <div style={{ borderTop: '1px solid var(--chat-border)', margin: '4px 0' }} />
                      <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-dim)' }}>
                        <div className="flex justify-between"><span>Messages</span><span style={{ color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{messages.length}</span></div>
                        <div className="flex justify-between"><span>Tokens used</span><span style={{ color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{formatTokens(totalTokens)}</span></div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, minHeight: 0, backgroundColor: 'var(--chat-bg)', position: 'relative' }}>
          {/* Model badge — permanently visible in corner after a response */}
          {lastResponseModel && (
            <div
              style={{
                position: 'absolute', bottom: '12px', right: '16px', zIndex: 10,
                padding: '4px 10px', borderRadius: '20px',
                backgroundColor: 'var(--chat-surface)', border: '1px solid var(--chat-border)',
                fontSize: '11px', color: 'var(--color-text-muted)',
                fontFamily: 'monospace', letterSpacing: '0.02em',
                pointerEvents: 'none',
              }}
            >
              model · {lastResponseModel}
            </div>
          )}
          <MessageArea
            messages={messages}
            isLoading={isStreaming}
            onRetry={() => retryLastMessage(selectedModelId, industry || undefined, selectedAgent?.id)}
            onSuggestedPrompt={(prompt) => handleSend(prompt)}
            onEditMessage={handleEditMessage}
            onDeleteMessage={deleteMessage}
            onRunCode={handleRunCode}
            onOpenInCanvas={handleOpenInCanvas}
          />
        </div>

        {/* Code Interpreter */}
        {codeInterpreter && (
          <div style={{ flexShrink: 0, borderTop: '1px solid var(--chat-border)', backgroundColor: 'var(--chat-bg)', maxHeight: '50%', overflowY: 'auto' }}>
            <CodeInterpreter
              code={codeInterpreter.code}
              language={codeInterpreter.language}
              onClose={() => setCodeInterpreter(null)}
              onExplain={(code) => { handleSend(`Explain this code:\n\`\`\`\n${code}\n\`\`\``); setCodeInterpreter(null) }}
              onFix={(code, error) => { handleSend(`Fix this error in the code:\n\nError: ${error}\n\n\`\`\`\n${code}\n\`\`\``); setCodeInterpreter(null) }}
              onOptimize={(code) => { handleSend(`Optimize this code:\n\`\`\`\n${code}\n\`\`\``); setCodeInterpreter(null) }}
            />
          </div>
        )}

        {/* Input */}
        <MessageInput
          onSend={handleSend}
          isLoading={isStreaming}
          onStop={stopStreaming}
          selectedModelId={selectedModelId}
          onFileProcessed={handleFileProcessed}
          onImageGenerated={handleImageGenerated}
          onSendWithContext={handleSendWithContext}
          onError={(msg) => toast.error(msg)}
        />
      </div>

      {/* RIGHT PANEL — Canvas */}
      {canvasOpen && (
        <CanvasPanel
          items={canvasItems}
          activeItemId={activeCanvasId}
          onClose={handleCloseCanvas}
          onUpdateItem={handleUpdateCanvasItem}
          onRemoveItem={handleRemoveCanvasItem}
          onSetActive={setActiveCanvasId}
          onInsertToChat={handleInsertToChat}
          onRunCode={handleRunCode}
        />
      )}

    </div>
  )
}

export default ChatPage
