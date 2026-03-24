import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, LayoutGrid, List, Search, Calendar,
  MessageSquare, CheckSquare, Square, ChevronRight, X, Clock,
  Send, Trash2, Eye, Circle, CheckCircle2
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { Avatar } from '../components/ui/Avatar'
import api from '../lib/api'

// ─── Types ───
interface SubTask { id: string; title: string; isCompleted: boolean; sortOrder: number }
interface TaskComment { id: string; content: string; createdAt: string; user: { id: string; name: string; avatar?: string } }
interface Task {
  id: string; title: string; description?: string; status: string; priority: string
  dueDate?: string; completedAt?: string; section?: string
  createdBy: { id: string; name: string; email: string; avatar?: string }
  assignedTo: { id: string; name: string; email: string; avatar?: string }
  subtasks?: SubTask[]; comments?: TaskComment[]
  _count?: { comments: number }
  createdAt: string; updatedAt: string
}
interface Member { id: string; name: string; email: string; role: string; avatar?: string }

// ─── Constants ───
const STATUSES = [
  { key: 'pending', label: 'To Do', icon: Circle, color: '#8E8E8E', bg: '#8E8E8E15' },
  { key: 'in_progress', label: 'In Progress', icon: Clock, color: '#3B82F6', bg: '#3B82F615' },
  { key: 'review', label: 'In Review', icon: Eye, color: '#A855F7', bg: '#A855F715' },
  { key: 'completed', label: 'Done', icon: CheckCircle2, color: '#10B981', bg: '#10B98115' },
]
const PRIORITIES: Record<string, { label: string; color: string; icon: string }> = {
  urgent: { label: 'Urgent', color: '#EF4444', icon: '🔴' },
  high: { label: 'High', color: '#F97316', icon: '🟠' },
  medium: { label: 'Medium', color: '#F59E0B', icon: '🟡' },
  low: { label: 'Low', color: '#6B7280', icon: '⚪' },
}

const formatDate = (d?: string) => {
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  const diff = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 7) return `${diff}d left`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const isOverdue = (d?: string) => d ? new Date(d) < new Date() : false
const dueDateColor = (d?: string) => {
  if (!d) return '#8E8E8E'
  const diff = Math.floor((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return '#EF4444'
  if (diff <= 2) return '#F59E0B'
  return '#10B981'
}

// ─── Main Component ───
export function TasksPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const isManager = ['org_owner', 'manager', 'platform_admin'].includes(user?.role || '')

  const fetchTasks = useCallback(async () => {
    try {
      const endpoint = isManager ? '/tasks/team' : '/tasks/my'
      const res = await api.get(endpoint, { params: { limit: 100 } })
      const data = res.data?.data?.tasks || res.data?.data || []
      setTasks(Array.isArray(data) ? data : [])
    } catch { setTasks([]) }
  }, [isManager])

  const fetchMembers = useCallback(async () => {
    try {
      const res = await api.get('/team/members')
      const data = res.data?.data?.members || res.data?.data || []
      setMembers(Array.isArray(data) ? data : [])
    } catch { setMembers([]) }
  }, [])

  useEffect(() => {
    Promise.all([fetchTasks(), fetchMembers()]).finally(() => setIsLoading(false))
  }, [fetchTasks, fetchMembers])

  const updateStatus = async (taskId: string, status: string) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status })
      toast.success(`Task moved to ${STATUSES.find(s => s.key === status)?.label || status}`)
      fetchTasks()
      if (detailTask?.id === taskId) fetchDetail(taskId)
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed') }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.delete(`/tasks/${taskId}`)
      toast.success('Task deleted')
      setDetailTask(null)
      fetchTasks()
    } catch { toast.error('Failed to delete') }
  }

  const fetchDetail = async (taskId: string) => {
    try {
      const res = await api.get(`/tasks/${taskId}`)
      setDetailTask(res.data?.data || null)
    } catch { toast.error('Failed to load task') }
  }

  const filtered = tasks.filter(t => {
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false
    if (filterAssignee !== 'all' && t.assignedTo?.id !== filterAssignee) return false
    return true
  })

  const byStatus = (status: string) => filtered.filter(t => t.status === status)
  const stats = {
    total: filtered.length,
    overdue: filtered.filter(t => t.dueDate && isOverdue(t.dueDate) && t.status !== 'completed').length,
    completed: byStatus('completed').length,
  }

  if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>

  return (
    <div className="flex-1 overflow-hidden" style={{ height: 'calc(100vh - 60px)' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>Tasks</h1>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {stats.total} tasks
              {stats.overdue > 0 && <span style={{ color: '#EF4444' }}> · {stats.overdue} overdue</span>}
              {' · '}{stats.completed} completed
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex" style={{ background: 'var(--color-surface-2)', borderRadius: '10px', padding: '3px' }}>
              {(['board', 'list'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                  background: view === v ? 'var(--color-primary)' : 'transparent',
                  color: view === v ? 'white' : 'var(--color-text-muted)',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>{v === 'board' ? <LayoutGrid size={14} /> : <List size={14} />} {v === 'board' ? 'Board' : 'List'}</button>
              ))}
            </div>
            {isManager && (
              <button onClick={() => setShowCreateModal(true)} style={{
                padding: '8px 16px', background: 'var(--color-primary)', color: 'white', border: 'none',
                borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}><Plus size={15} /> New Task</button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3" style={{ paddingBottom: '12px' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '280px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tasks..." style={{
                width: '100%', padding: '7px 10px 7px 32px', background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-primary)',
                fontSize: '13px', outline: 'none',
              }} />
          </div>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{
            padding: '7px 10px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '13px', cursor: 'pointer',
          }}>
            <option value="all">All Priorities</option>
            <option value="urgent">🔴 Urgent</option>
            <option value="high">🟠 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">⚪ Low</option>
          </select>
          {isManager && members.length > 0 && (
            <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{
              padding: '7px 10px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
              borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '13px', cursor: 'pointer',
            }}>
              <option value="all">All Members</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ height: 'calc(100% - 130px)', overflow: 'auto', padding: '16px 24px' }}>
        {view === 'board' ? (
          <BoardView tasks={filtered} onTaskClick={fetchDetail} onStatusChange={updateStatus} />
        ) : (
          <ListView tasks={filtered} onTaskClick={fetchDetail} />
        )}
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {detailTask && (
          <TaskDetailPanel task={detailTask} onClose={() => setDetailTask(null)}
            onStatusChange={updateStatus} onDelete={handleDeleteTask} onRefresh={() => fetchDetail(detailTask.id)}
            fetchTasks={fetchTasks} isManager={isManager} userId={user?.id || ''} />
        )}
      </AnimatePresence>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateTaskModal members={members} onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchTasks() }} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Board View (Kanban)
// ═══════════════════════════════════════════
function BoardView({ tasks, onTaskClick, onStatusChange }: {
  tasks: Task[]; onTaskClick: (id: string) => void; onStatusChange: (id: string, status: string) => void
}) {
  const byStatus = (key: string) => tasks.filter(t => t.status === key)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STATUSES.length}, 1fr)`, gap: '12px', height: '100%', minHeight: '400px' }}>
      {STATUSES.map(col => {
        const colTasks = byStatus(col.key)
        const Icon = col.icon
        return (
          <div key={col.key} style={{
            background: 'var(--color-surface)', borderRadius: '14px', border: '1px solid var(--color-border)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = col.color }}
            onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
            onDrop={e => {
              e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-border)'
              const taskId = e.dataTransfer.getData('taskId')
              if (taskId) onStatusChange(taskId, col.key)
            }}
          >
            <div className="flex items-center justify-between" style={{ padding: '14px 14px 10px', borderBottom: `2px solid ${col.color}30` }}>
              <div className="flex items-center gap-2">
                <Icon size={15} style={{ color: col.color }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{col.label}</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: col.color, background: col.bg, padding: '1px 8px', borderRadius: '10px' }}>{colTasks.length}</span>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {colTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--color-text-dim)', fontSize: '12px' }}>No tasks</div>
              ) : colTasks.map(task => (
                <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const p = PRIORITIES[task.priority] || PRIORITIES.medium
  const overdue = isOverdue(task.dueDate) && task.status !== 'completed'
  const subtasksDone = task.subtasks?.filter(s => s.isCompleted).length || 0
  const subtasksTotal = task.subtasks?.length || 0

  return (
    <motion.div draggable onDragStart={e => e.dataTransfer.setData('taskId', task.id)}
      onClick={onClick} whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
      style={{
        background: 'var(--color-surface-2)', borderRadius: '10px', padding: '12px',
        cursor: 'pointer', border: `1px solid ${overdue ? '#EF444440' : 'var(--color-border)'}`,
      }}
    >
      <div className="flex items-start gap-2" style={{ marginBottom: '8px' }}>
        <span style={{ fontSize: '10px', flexShrink: 0, marginTop: '2px' }}>{p.icon}</span>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: '1.4' }}>{task.title}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className="flex items-center gap-1" style={{ fontSize: '11px', color: dueDateColor(task.dueDate) }}>
              <Calendar size={10} /> {formatDate(task.dueDate)}
            </span>
          )}
          {subtasksTotal > 0 && (
            <span className="flex items-center gap-1" style={{ fontSize: '11px', color: subtasksDone === subtasksTotal ? '#10B981' : 'var(--color-text-muted)' }}>
              <CheckSquare size={10} /> {subtasksDone}/{subtasksTotal}
            </span>
          )}
          {(task._count?.comments || 0) > 0 && (
            <span className="flex items-center gap-1" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              <MessageSquare size={10} /> {task._count?.comments}
            </span>
          )}
        </div>
        <Avatar name={task.assignedTo?.name || '?'} src={task.assignedTo?.avatar} size="xs" />
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════
// List View
// ═══════════════════════════════════════════
function ListView({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (id: string) => void }) {
  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: '14px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 120px 100px 100px 120px 40px',
        padding: '10px 16px', borderBottom: '1px solid var(--color-border)', fontSize: '11px',
        fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        <span>Task</span><span>Assignee</span><span>Priority</span><span>Status</span><span>Due</span><span></span>
      </div>
      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)', fontSize: '13px' }}>No tasks found</div>
      ) : tasks.map(task => {
        const p = PRIORITIES[task.priority] || PRIORITIES.medium
        const sc = STATUSES.find(s => s.key === task.status) || STATUSES[0]
        const overdue = isOverdue(task.dueDate) && task.status !== 'completed'
        return (
          <div key={task.id} onClick={() => onTaskClick(task.id)} style={{
            display: 'grid', gridTemplateColumns: '1fr 120px 100px 100px 120px 40px',
            padding: '10px 16px', borderBottom: '1px solid var(--color-border-subtle)',
            cursor: 'pointer', transition: 'background 0.15s', alignItems: 'center',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span style={{ fontSize: '12px' }}>{p.icon}</span>
              <span className="truncate" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{task.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <Avatar name={task.assignedTo?.name || '?'} src={task.assignedTo?.avatar} size="xs" />
              <span className="truncate" style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{task.assignedTo?.name}</span>
            </div>
            <span style={{ fontSize: '11px', color: p.color, fontWeight: 500 }}>{p.label}</span>
            <span style={{ fontSize: '11px', color: sc.color, background: sc.bg, padding: '2px 8px', borderRadius: '6px', fontWeight: 500, width: 'fit-content' }}>{sc.label}</span>
            <span style={{ fontSize: '12px', color: overdue ? '#EF4444' : dueDateColor(task.dueDate), fontWeight: overdue ? 600 : 400 }}>{formatDate(task.dueDate) || '—'}</span>
            <ChevronRight size={14} style={{ color: 'var(--color-text-dim)' }} />
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════
// Task Detail Panel (Slide-out)
// ═══════════════════════════════════════════
function TaskDetailPanel({ task, onClose, onStatusChange, onDelete, onRefresh, fetchTasks, isManager, userId }: {
  task: Task; onClose: () => void; onStatusChange: (id: string, s: string) => void
  onDelete: (id: string) => void; onRefresh: () => void; fetchTasks: () => void
  isManager: boolean; userId: string
}) {
  const toast = useToast()
  const [comment, setComment] = useState('')
  const [newSubtask, setNewSubtask] = useState('')
  const [sending, setSending] = useState(false)
  const commentsEnd = useRef<HTMLDivElement>(null)

  const sc = STATUSES.find(s => s.key === task.status) || STATUSES[0]
  const p = PRIORITIES[task.priority] || PRIORITIES.medium
  const canModify = task.createdBy?.id === userId || isManager
  const canUpdateStatus = task.assignedTo?.id === userId || canModify
  const subtasksDone = task.subtasks?.filter(s => s.isCompleted).length || 0
  const subtasksTotal = task.subtasks?.length || 0

  const handleAddComment = async () => {
    if (!comment.trim() || sending) return
    setSending(true)
    try {
      await api.post(`/tasks/${task.id}/comments`, { content: comment })
      setComment('')
      onRefresh()
    } catch { toast.error('Failed to add comment') }
    finally { setSending(false) }
  }

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return
    try {
      await api.post(`/tasks/${task.id}/subtasks`, { title: newSubtask })
      setNewSubtask('')
      onRefresh()
    } catch { toast.error('Failed to add subtask') }
  }

  const toggleSubtask = async (subtaskId: string) => {
    try { await api.patch(`/tasks/subtasks/${subtaskId}/toggle`); onRefresh() } catch { toast.error('Failed') }
  }

  const handleDeleteSubtask = async (subtaskId: string) => {
    try { await api.delete(`/tasks/subtasks/${subtaskId}`); onRefresh() } catch { toast.error('Failed') }
  }

  const nextStatuses = ['pending', 'in_progress', 'review', 'completed', 'cancelled'].filter(s => s !== task.status)

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 }} />

      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '520px', maxWidth: '90vw',
          background: 'var(--color-background)', borderLeft: '1px solid var(--color-border)',
          zIndex: 51, display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, color: sc.color, background: sc.bg, border: `1px solid ${sc.color}25` }}>{sc.label}</span>
            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 500, color: p.color, background: `${p.color}15` }}>{p.icon} {p.label}</span>
          </div>
          <div className="flex items-center gap-1">
            {canModify && (
              <button onClick={() => { if (confirm('Delete this task?')) onDelete(task.id) }}
                style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', borderRadius: '6px' }}>
                <Trash2 size={15} />
              </button>
            )}
            <button onClick={onClose} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 12px', lineHeight: '1.3' }}>{task.title}</h2>

          {task.description && (
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.6', marginBottom: '20px' }}>{task.description}</p>
          )}

          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            <MetaItem label="Assigned to" value={task.assignedTo?.name} avatar={task.assignedTo} />
            <MetaItem label="Created by" value={task.createdBy?.name} avatar={task.createdBy} />
            <MetaItem label="Due date" value={formatDate(task.dueDate) || 'No due date'} color={dueDateColor(task.dueDate)} />
            <MetaItem label="Created" value={new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
          </div>

          {/* Status Actions */}
          {canUpdateStatus && (
            <div style={{ marginBottom: '20px' }}>
              <SectionLabel>Move to</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map(s => {
                  const st = STATUSES.find(x => x.key === s)
                  const color = st?.color || (s === 'cancelled' ? '#EF4444' : '#F59E0B')
                  const label = st?.label || (s === 'cancelled' ? 'Cancel' : s)
                  return (
                    <button key={s} onClick={() => onStatusChange(task.id, s)} style={{
                      padding: '5px 12px', borderRadius: '8px', border: `1px solid ${color}30`,
                      background: `${color}10`, color, fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                    }}>{label}</button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Subtasks */}
          <div style={{ marginBottom: '20px' }}>
            <SectionLabel>Subtasks {subtasksTotal > 0 && `(${subtasksDone}/${subtasksTotal})`}</SectionLabel>
            {subtasksTotal > 0 && (
              <div style={{ height: '3px', borderRadius: '2px', background: 'var(--color-surface-3)', marginBottom: '8px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(subtasksDone / subtasksTotal) * 100}%`, background: subtasksDone === subtasksTotal ? '#10B981' : 'var(--color-primary)', borderRadius: '2px', transition: 'width 0.3s' }} />
              </div>
            )}
            {task.subtasks?.map(st => (
              <div key={st.id} className="flex items-center gap-2" style={{ padding: '6px 8px', borderRadius: '6px', marginBottom: '2px' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <button onClick={() => toggleSubtask(st.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  {st.isCompleted ? <CheckSquare size={15} style={{ color: '#10B981' }} /> : <Square size={15} style={{ color: 'var(--color-text-muted)' }} />}
                </button>
                <span style={{ fontSize: '13px', flex: 1, color: st.isCompleted ? 'var(--color-text-dim)' : 'var(--color-text-primary)', textDecoration: st.isCompleted ? 'line-through' : 'none' }}>{st.title}</span>
                <button onClick={() => handleDeleteSubtask(st.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--color-text-dim)', opacity: 0.5 }}><X size={12} /></button>
              </div>
            ))}
            <div className="flex items-center gap-2" style={{ marginTop: '6px' }}>
              <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
                placeholder="Add a subtask..." style={{
                  flex: 1, padding: '6px 10px', background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)', borderRadius: '6px',
                  color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none',
                }} />
              <button onClick={handleAddSubtask} style={{
                padding: '6px 10px', background: 'var(--color-primary)', color: 'white',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
              }}>Add</button>
            </div>
          </div>

          {/* Comments */}
          <div>
            <SectionLabel>Comments ({task.comments?.length || 0})</SectionLabel>
            {task.comments?.map(c => (
              <div key={c.id} className="flex gap-2" style={{ marginBottom: '12px' }}>
                <Avatar name={c.user.name} src={c.user.avatar} size="xs" />
                <div style={{ flex: 1 }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.user.name}</span>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-dim)' }}>
                      {new Date(c.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '2px 0 0', lineHeight: '1.5' }}>{c.content}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2" style={{ marginTop: '8px' }}>
              <input value={comment} onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                placeholder="Write a comment..." style={{
                  flex: 1, padding: '8px 12px', background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)', borderRadius: '8px',
                  color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none',
                }} />
              <button onClick={handleAddComment} disabled={sending || !comment.trim()} style={{
                padding: '8px', background: comment.trim() ? 'var(--color-primary)' : 'var(--color-surface-3)',
                color: 'white', border: 'none', borderRadius: '8px', cursor: comment.trim() ? 'pointer' : 'default',
              }}><Send size={14} /></button>
            </div>
            <div ref={commentsEnd} />
          </div>
        </div>
      </motion.div>
    </>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>{children}</label>
}

function MetaItem({ label, value, avatar, color }: { label: string; value: string; avatar?: { name: string; avatar?: string }; color?: string }) {
  return (
    <div>
      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <div className="flex items-center gap-2" style={{ marginTop: '4px' }}>
        {avatar && <Avatar name={avatar.name} src={avatar.avatar} size="xs" />}
        <span style={{ fontSize: '13px', color: color || 'var(--color-text-primary)', fontWeight: 500 }}>{value}</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// Create Task Modal
// ═══════════════════════════════════════════
function CreateTaskModal({ members, onClose, onCreated }: { members: Member[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedToId, setAssignedToId] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!title.trim()) return toast.error('Title is required')
    if (!assignedToId) return toast.error('Please select an assignee')
    setCreating(true)
    try {
      await api.post('/tasks', { title: title.trim(), description: description.trim() || undefined, assignedToId, priority, dueDate: dueDate || undefined })
      toast.success('Task created')
      onCreated()
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Failed to create task') }
    finally { setCreating(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{
          background: 'var(--color-surface)', borderRadius: '16px', border: '1px solid var(--color-border)',
          width: '480px', maxWidth: '90vw', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        }}>
        <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 20px' }}>Create Task</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." autoFocus
            style={{ padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: '10px', color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none', fontWeight: 500 }} />

          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Add a description..." rows={3}
            style={{ padding: '10px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: '10px', color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none', resize: 'vertical' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Assign to</label>
              <select value={assignedToId} onChange={e => setAssignedToId(e.target.value)} style={{
                width: '100%', padding: '8px 10px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '13px', cursor: 'pointer',
              }}>
                <option value="">Select member</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={{
                width: '100%', padding: '8px 10px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '13px', cursor: 'pointer',
              }}>
                <option value="low">⚪ Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🟠 High</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Due date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{
              width: '100%', padding: '8px 10px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
              borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '13px',
            }} />
          </div>
        </div>

        <div className="flex justify-end gap-2" style={{ marginTop: '20px' }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)', borderRadius: '10px', cursor: 'pointer', fontSize: '13px',
          }}>Cancel</button>
          <button onClick={handleCreate} disabled={creating} style={{
            padding: '8px 18px', background: 'var(--color-primary)', color: 'white',
            border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
            opacity: creating ? 0.6 : 1,
          }}>{creating ? 'Creating...' : 'Create Task'}</button>
        </div>
      </motion.div>
    </div>
  )
}

export default TasksPage
