import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Trash2, Pin, PinOff, Pencil, FolderPlus, Folder, ChevronDown, ChevronRight, Download, MoreHorizontal, X, LogOut, Settings, LayoutDashboard, Sun, Moon } from 'lucide-react'
import { formatRelativeTime, formatCurrency, truncate, groupByDate } from '../../lib/utils'
import type { Conversation, ChatFolder } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { Avatar } from '../ui/Avatar'

interface ConversationListProps {
  conversations: Conversation[]
  folders: ChatFolder[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onTogglePin: (id: string) => void
  onMoveToFolder: (convId: string, folderId: string | undefined) => void
  onCreateFolder: (name: string) => void
  onDeleteFolder: (id: string) => void
}

function ContextMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 context-menu-enter"
      style={{ top: y, left: x, background: 'var(--color-surface-3)', border: '1px solid var(--chat-border)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', padding: '4px 0', minWidth: '170px', backdropFilter: 'blur(12px)' }}
    >
      {children}
    </div>
  )
}

function ContextMenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5"
      style={{ padding: '7px 14px', fontSize: '13px', color: danger ? 'var(--color-danger)' : 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', transition: 'all 150ms', borderRadius: '4px', margin: '0 4px', width: 'calc(100% - 8px)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.08)' : 'var(--color-surface-2)'; if (!danger) e.currentTarget.style.color = 'var(--color-text-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = danger ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}
    >
      {icon}
      {label}
    </button>
  )
}

export function ConversationList({
  conversations, folders, activeId, onSelect, onNew, onDelete,
  onRename, onTogglePin, onMoveToFolder, onCreateFolder, onDeleteFolder,
}: ConversationListProps) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.messages.some((m) => m.content.toLowerCase().includes(search.toLowerCase()))
  ), [conversations, search])

  const pinned = useMemo(() => filtered.filter((c) => c.isPinned), [filtered])
  const foldered = useMemo(() => folders.map((f) => ({
    folder: f,
    convs: filtered.filter((c) => c.folderId === f.id && !c.isPinned),
  })), [filtered, folders])
  const grouped = useMemo(() => {
    const unfolderedUnpinned = filtered.filter((c) => !c.isPinned && !c.folderId)
    return groupByDate(unfolderedUnpinned, 'updatedAt')
  }, [filtered])

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    setContextMenu({ id, x: e.clientX, y: e.clientY })
  }

  const startRename = (id: string) => {
    const conv = conversations.find((c) => c.id === id)
    setRenamingId(id)
    setRenameValue(conv?.title || '')
    setContextMenu(null)
  }

  const submitRename = () => {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  const submitNewFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim())
      setNewFolderName('')
      setShowNewFolder(false)
    }
  }

  const toggleFolder = (fId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(fId)) next.delete(fId)
      else next.add(fId)
      return next
    })
  }

  const exportConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id)
    if (!conv) return
    const md = conv.messages.map((m) => `**${m.role}**: ${m.content}`).join('\n\n---\n\n')
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${conv.title.replace(/\s+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
    setContextMenu(null)
  }

  const renderConvItem = (conv: Conversation) => {
    const isActive = activeId === conv.id
    return (
      <div
        key={conv.id}
        onClick={() => onSelect(conv.id)}
        onContextMenu={(e) => handleContextMenu(e, conv.id)}
        className="group conversation-item"
        style={{
          margin: '1px 6px', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
          backgroundColor: isActive ? 'var(--color-surface-3)' : 'transparent',
          borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
          transition: 'all 150ms ease',
        }}
        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-surface-2)' }}
        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = isActive ? 'var(--color-surface-3)' : 'transparent' }}
      >
        {renamingId === conv.id ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenamingId(null) }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', background: 'var(--chat-border)', border: '1px solid var(--color-border-hover)', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', color: 'var(--color-text-primary)', outline: 'none' }}
          />
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              {conv.isPinned && <Pin size={10} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
              <p style={{ fontSize: '13.5px', color: 'var(--color-text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{truncate(conv.title, 30)}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', flexShrink: 0 }}>{formatRelativeTime(conv.updatedAt)}</span>
              {conv.totalCost > 0 && (
                <span className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '11px', color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>
                  {formatCurrency(conv.totalCost)}
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleContextMenu(e, conv.id) }}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                style={{ padding: '2px', color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <MoreHorizontal size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-surface)', width: '240px', minWidth: '240px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 12px 10px', flexShrink: 0 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>ConvoiaAI</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewFolder(true)}
              title="New Folder"
              style={{ padding: '5px', color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px', transition: 'color 150ms' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
            >
              <FolderPlus size={14} />
            </button>
            <button
              onClick={onNew}
              title="New chat"
              style={{ padding: '5px', color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '6px', transition: 'color 150ms' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-dim)'}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute top-1/2 -translate-y-1/2" style={{ left: '10px', color: 'var(--color-text-dim)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            aria-label="Search conversations"
            style={{ width: '100%', padding: '8px 10px 8px 32px', backgroundColor: 'var(--color-surface-2)', border: '1px solid transparent', borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none', transition: 'border-color 200ms' }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}
          />
        </div>
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-2" style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-surface-2)', flexShrink: 0 }}>
          <Folder size={14} style={{ color: 'var(--color-text-dim)', flexShrink: 0 }} />
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitNewFolder(); if (e.key === 'Escape') setShowNewFolder(false) }}
            placeholder="Folder name..."
            style={{ flex: 1, background: 'var(--color-surface-2)', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--color-text-primary)', outline: 'none' }}
          />
          <button onClick={() => setShowNewFolder(false)} style={{ color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: '6px', paddingBottom: '6px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '12px' }}>No conversations yet</div>
        ) : (
          <>
            {/* Pinned */}
            {pinned.length > 0 && (
              <div style={{ marginBottom: '4px' }}>
                <p className="flex items-center gap-1.5" style={{ padding: '10px 14px 4px', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)', margin: 0 }}>
                  <Pin size={10} /> Pinned
                </p>
                {pinned.map(renderConvItem)}
              </div>
            )}

            {/* Folders */}
            {foldered.map(({ folder, convs }) => convs.length > 0 && (
              <div key={folder.id} style={{ marginBottom: '4px' }}>
                <button
                  onClick={() => toggleFolder(folder.id)}
                  className="w-full flex items-center gap-1.5 group"
                  style={{ padding: '10px 14px 4px', fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {expandedFolders.has(folder.id) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  <Folder size={10} />
                  {folder.name}
                  <span style={{ marginLeft: 'auto', color: 'var(--color-text-dim)' }}>{convs.length}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ padding: '2px', color: 'var(--color-text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <Trash2 size={10} />
                  </button>
                </button>
                {expandedFolders.has(folder.id) && convs.map(renderConvItem)}
              </div>
            ))}

            {/* YOUR CHATS section label */}
            {['Today', 'Yesterday', 'Older'].filter(g => grouped[g]?.length).map((group) => (
              <div key={group} style={{ marginBottom: '4px' }}>
                <p style={{ padding: '12px 14px 4px', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)', margin: 0 }}>{group}</p>
                {grouped[group].map(renderConvItem)}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Navigation + User at bottom */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--color-border-subtle)' }}>
        {/* Quick nav links — chips with distinct colors so each icon reads at a glance */}
        <div style={{ display: 'flex', gap: '6px', padding: '10px 10px 6px' }}>
          {[
            { title: 'Dashboard', Icon: LayoutDashboard, onClick: () => navigate('/dashboard'), color: 'var(--color-primary)', rgb: '20, 184, 205' /* accent turquoise — muted hover */ },
            { title: 'Settings', Icon: Settings, onClick: () => navigate('/settings'), color: 'var(--color-text-secondary)', rgb: '148, 163, 184' },
            { title: theme === 'dark' ? 'Light mode' : 'Dark mode', Icon: theme === 'dark' ? Sun : Moon, onClick: toggleTheme, color: theme === 'dark' ? '#F59E0B' : '#6366F1', rgb: theme === 'dark' ? '245, 158, 11' : '99, 102, 241' },
            { title: 'Logout', Icon: LogOut, onClick: logout, color: '#EF4444', rgb: '239, 68, 68' },
          ].map(({ title, Icon, onClick, color, rgb }) => (
            <button
              key={title}
              onClick={onClick}
              title={title}
              aria-label={title}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '8px', borderRadius: '8px', cursor: 'pointer',
                background: `rgba(${rgb}, 0.08)`,
                border: `0.5px solid rgba(${rgb}, 0.25)`,
                color,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${rgb}, 0.18)`; e.currentTarget.style.borderColor = `rgba(${rgb}, 0.5)` }}
              onMouseLeave={(e) => { e.currentTarget.style.background = `rgba(${rgb}, 0.08)`; e.currentTarget.style.borderColor = `rgba(${rgb}, 0.25)` }}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

        {/* User profile — click to go to settings */}
        <div className="flex items-center gap-3" style={{ padding: '8px 12px', cursor: 'pointer' }}
          onClick={() => navigate('/settings')}>
          <Avatar name={user?.name || 'User'} src={user?.avatar} size="sm" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="truncate" style={{ fontSize: '13px', color: 'var(--color-text-primary)', margin: 0, fontWeight: 500 }}>{user?.name || 'User'}</p>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0, textTransform: 'capitalize' }}>{user?.role?.replace('_', ' ') || 'Member'}</p>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
          <ContextMenuItem icon={<Pencil size={14} />} label="Rename" onClick={() => startRename(contextMenu.id)} />
          <ContextMenuItem
            icon={conversations.find((c) => c.id === contextMenu.id)?.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
            label={conversations.find((c) => c.id === contextMenu.id)?.isPinned ? 'Unpin' : 'Pin'}
            onClick={() => { onTogglePin(contextMenu.id); setContextMenu(null) }}
          />
          <ContextMenuItem icon={<Download size={14} />} label="Export" onClick={() => exportConversation(contextMenu.id)} />
          {folders.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--chat-border)', margin: '4px 0' }} />
              {folders.map((f) => (
                <ContextMenuItem key={f.id} icon={<Folder size={14} />} label={`Move to ${f.name}`} onClick={() => { onMoveToFolder(contextMenu.id, f.id); setContextMenu(null) }} />
              ))}
              <ContextMenuItem icon={<Folder size={14} />} label="Remove from folder" onClick={() => { onMoveToFolder(contextMenu.id, undefined); setContextMenu(null) }} />
            </>
          )}
          <div style={{ borderTop: '1px solid var(--chat-border)', margin: '4px 0' }} />
          <ContextMenuItem icon={<Trash2 size={14} />} label="Delete" danger onClick={() => { onDelete(contextMenu.id); setContextMenu(null) }} />
        </ContextMenu>
      )}
    </div>
  )
}
