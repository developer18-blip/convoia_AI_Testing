import { useState, useEffect } from 'react'
import { Plus, CheckCircle2, Clock, AlertCircle, MessageSquare, Trash2, X, Send } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { LoadingPage } from '../components/shared/LoadingPage'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import api from '../lib/api'

interface Task {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  dueDate: string | null
  completedAt: string | null
  createdAt: string
  createdBy: { id: string; name: string; email: string; role: string }
  assignedTo: { id: string; name: string; email: string; role: string }
  comments: { id: string; content: string; createdAt: string; user: { name: string } }[]
}

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
}

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  pending: { color: '#F59E0B', icon: Clock, label: 'Pending' },
  in_progress: { color: '#3B82F6', icon: AlertCircle, label: 'In Progress' },
  completed: { color: '#10B981', icon: CheckCircle2, label: 'Completed' },
  cancelled: { color: '#6B7280', icon: X, label: 'Cancelled' },
}

const priorityColors: Record<string, string> = {
  low: '#6B7280',
  medium: '#F59E0B',
  high: '#F97316',
  urgent: '#EF4444',
}

export default function TasksPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [comment, setComment] = useState('')

  const isManager = user?.role === 'manager' || user?.role === 'org_owner' || user?.role === 'platform_admin'

  const fetchTasks = async () => {
    try {
      setIsLoading(true)
      const [myRes, createdRes, teamRes] = await Promise.allSettled([
        api.get('/tasks/my'),
        api.get('/tasks/created'),
        isManager ? api.get('/tasks/team') : Promise.resolve({ data: { data: [] } }),
      ])

      const allTasks = new Map<string, Task>()
      const extract = (res: any) => {
        if (res.status === 'fulfilled') {
          const items = res.value.data?.data?.tasks || res.value.data?.data || []
          if (Array.isArray(items)) items.forEach((t: Task) => allTasks.set(t.id, t))
        }
      }
      extract(myRes)
      extract(createdRes)
      extract(teamRes)
      setTasks(Array.from(allTasks.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    } catch {
      toast.error('Failed to load tasks')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchMembers = async () => {
    if (!isManager || !user?.organizationId) return
    try {
      const res = await api.get('/team/members')
      setTeamMembers(res.data.data?.members || res.data.data || [])
    } catch {}
  }

  useEffect(() => { fetchTasks(); fetchMembers() }, [])

  const updateStatus = async (taskId: string, status: string) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status })
      toast.success(`Task marked as ${status.replace('_', ' ')}`)
      fetchTasks()
      if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, status } : null)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update')
    }
  }

  const deleteTask = async (taskId: string) => {
    try {
      await api.delete(`/tasks/${taskId}`)
      toast.success('Task deleted')
      setSelectedTask(null)
      fetchTasks()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete')
    }
  }

  const addComment = async (taskId: string) => {
    if (!comment.trim()) return
    try {
      await api.post(`/tasks/${taskId}/comments`, { content: comment.trim() })
      setComment('')
      toast.success('Comment added')
      fetchTasks()
      // Refresh selected task
      const res = await api.get('/tasks/my')
      const allTasks = [...(res.data.data?.tasks || res.data.data || [])]
      const updated = allTasks.find((t: Task) => t.id === taskId)
      if (updated) setSelectedTask(updated)
    } catch {
      toast.error('Failed to add comment')
    }
  }

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)

  if (isLoading) return <LoadingPage />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Tasks</h2>
          <p className="text-sm text-text-muted mt-1">
            {isManager ? 'Manage and assign tasks to your team' : 'Your assigned tasks'}
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--color-primary)', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={16} /> New Task
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'pending', 'in_progress', 'completed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
              background: filter === f ? 'var(--color-primary)' : 'var(--chat-hover)',
              color: filter === f ? 'white' : 'var(--color-text-secondary)',
              border: `1px solid ${filter === f ? 'var(--color-primary)' : 'var(--chat-border)'}`,
              cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} ({f === 'all' ? tasks.length : tasks.filter(t => t.status === f).length})
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', count: tasks.length, color: '#7C3AED' },
          { label: 'Pending', count: tasks.filter(t => t.status === 'pending').length, color: '#F59E0B' },
          { label: 'In Progress', count: tasks.filter(t => t.status === 'in_progress').length, color: '#3B82F6' },
          { label: 'Completed', count: tasks.filter(t => t.status === 'completed').length, color: '#10B981' },
        ].map(s => (
          <Card key={s.label} padding="sm">
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '2px' }}>{s.label}</p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.count}</p>
          </Card>
        ))}
      </div>

      {/* Task List */}
      <Card padding="none">
        {filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <CheckCircle2 size={32} style={{ color: 'var(--color-text-dim)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
              {filter === 'all' ? 'No tasks yet' : `No ${filter.replace('_', ' ')} tasks`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {filtered.map(task => {
              const sc = statusConfig[task.status] || statusConfig.pending
              const StatusIcon = sc.icon
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="flex items-center gap-4 hover:bg-surface-2 transition-colors cursor-pointer"
                  style={{ padding: '14px 16px' }}
                >
                  <StatusIcon size={18} style={{ color: sc.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}>
                      {task.title}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                      Assigned to {task.assignedTo?.name || 'Unknown'}
                      {task.dueDate && ` · Due ${new Date(task.dueDate).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge size="sm" style={{ background: `${priorityColors[task.priority]}20`, color: priorityColors[task.priority] }}>
                    {task.priority}
                  </Badge>
                  <Badge size="sm" style={{ background: `${sc.color}20`, color: sc.color }}>
                    {sc.label}
                  </Badge>
                  {task.comments?.length > 0 && (
                    <span className="flex items-center gap-1" style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>
                      <MessageSquare size={12} /> {task.comments.length}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Create Task Modal */}
      {showCreate && <CreateTaskModal members={teamMembers} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchTasks() }} />}

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          isManager={isManager}
          comment={comment}
          setComment={setComment}
          onClose={() => { setSelectedTask(null); setComment('') }}
          onStatusChange={updateStatus}
          onDelete={deleteTask}
          onAddComment={addComment}
        />
      )}
    </div>
  )
}

function CreateTaskModal({ members, onClose, onCreated }: { members: TeamMember[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedToId, setAssignedToId] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    if (!assignedToId) { toast.error('Please select a team member'); return }
    try {
      setSaving(true)
      await api.post('/tasks', {
        title: title.trim(),
        description: description.trim() || undefined,
        assignedToId,
        priority,
        dueDate: dueDate || undefined,
        organizationId: user?.organizationId,
      })
      toast.success('Task created')
      onCreated()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--chat-bg)', borderRadius: '16px', border: '1px solid var(--chat-border)', width: '480px', maxHeight: '90vh', overflow: 'auto', padding: '24px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>New Task</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Task details..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>Assign To *</label>
            <select value={assignedToId} onChange={e => setAssignedToId(e.target.value)} style={inputStyle}>
              <option value="">Select member...</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2" style={{ marginTop: '24px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '13px', background: 'var(--chat-hover)', color: 'var(--color-text-secondary)', border: '1px solid var(--chat-border)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleCreate} disabled={saving} style={{ padding: '8px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'var(--color-primary)', color: 'white', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskDetailModal({ task, isManager, comment, setComment, onClose, onStatusChange, onDelete, onAddComment }: {
  task: Task; isManager: boolean; comment: string; setComment: (v: string) => void
  onClose: () => void; onStatusChange: (id: string, status: string) => void; onDelete: (id: string) => void; onAddComment: (id: string) => void
}) {
  const { user } = useAuth()
  const sc = statusConfig[task.status] || statusConfig.pending
  const isCreator = task.createdBy?.id === user?.id
  const isAssignee = task.assignedTo?.id === user?.id

  // Progress stepper
  const steps = ['pending', 'in_progress', 'completed']
  const currentStep = task.status === 'cancelled' ? -1 : steps.indexOf(task.status)
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--chat-bg)', borderRadius: '20px', border: '1px solid var(--chat-border)', width: '580px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}>
        {/* Color accent bar */}
        <div style={{ height: '4px', background: `linear-gradient(90deg, ${sc.color}, ${priorityColors[task.priority]})`, borderRadius: '20px 20px 0 0' }} />

        <div style={{ padding: '24px' }}>
          {/* Header */}
          <div className="flex items-start justify-between" style={{ marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.3 }}>{task.title}</h3>
              <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: '10px' }}>
                <Badge size="sm" style={{ background: `${sc.color}15`, color: sc.color, border: `1px solid ${sc.color}30`, fontWeight: 600 }}>{sc.label}</Badge>
                <Badge size="sm" style={{ background: `${priorityColors[task.priority]}15`, color: priorityColors[task.priority], border: `1px solid ${priorityColors[task.priority]}30` }}>{task.priority} priority</Badge>
                {isOverdue && <Badge size="sm" style={{ background: '#EF444415', color: '#EF4444', border: '1px solid #EF444430' }}>Overdue</Badge>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'var(--chat-hover)', border: '1px solid var(--chat-border)', color: 'var(--color-text-muted)', cursor: 'pointer', borderRadius: '10px', padding: '6px' }}><X size={16} /></button>
          </div>

          {/* Progress Stepper */}
          {task.status !== 'cancelled' && (
            <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--chat-hover)', borderRadius: '14px' }}>
              <div className="flex items-center justify-between" style={{ position: 'relative' }}>
                {/* Progress line */}
                <div style={{ position: 'absolute', top: '14px', left: '28px', right: '28px', height: '3px', background: 'var(--chat-border)', borderRadius: '2px' }} />
                <div style={{ position: 'absolute', top: '14px', left: '28px', height: '3px', background: 'var(--color-primary)', borderRadius: '2px', width: `${Math.max(0, currentStep) * 50}%`, transition: 'width 0.5s ease' }} />
                {steps.map((step, i) => {
                  const done = i <= currentStep
                  const active = i === currentStep
                  return (
                    <div key={step} className="flex flex-col items-center" style={{ position: 'relative', zIndex: 1 }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: done ? 'var(--color-primary)' : 'var(--chat-bg)',
                        border: `2px solid ${done ? 'var(--color-primary)' : 'var(--chat-border)'}`,
                        boxShadow: active ? '0 0 0 4px rgba(124, 58, 237, 0.2)' : 'none',
                        transition: 'all 0.3s ease',
                      }}>
                        {done ? <CheckCircle2 size={14} style={{ color: 'white' }} /> : <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--chat-border)' }} />}
                      </div>
                      <span style={{ fontSize: '10px', color: done ? 'var(--color-primary)' : 'var(--color-text-dim)', marginTop: '6px', fontWeight: active ? 700 : 400 }}>
                        {step === 'pending' ? 'Assigned' : step === 'in_progress' ? 'In Progress' : 'Completed'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div style={{ marginBottom: '16px', padding: '14px', background: 'var(--chat-hover)', borderRadius: '12px', borderLeft: `3px solid ${sc.color}` }}>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.7, margin: 0 }}>{task.description}</p>
            </div>
          )}

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3" style={{ marginBottom: '20px' }}>
            {[
              { label: 'Created by', value: task.createdBy?.name, sub: task.createdBy?.role?.replace('_', ' ') },
              { label: 'Assigned to', value: task.assignedTo?.name, sub: task.assignedTo?.role?.replace('_', ' ') },
              { label: 'Created', value: new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
              { label: 'Due date', value: task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline', highlight: isOverdue },
            ].map((item, i) => (
              <div key={i} style={{ padding: '12px', background: 'var(--chat-hover)', borderRadius: '12px', border: (item as any).highlight ? '1px solid #EF444440' : '1px solid transparent' }}>
                <p style={{ fontSize: '10px', color: 'var(--color-text-dim)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</p>
                <p style={{ fontSize: '14px', fontWeight: 600, color: (item as any).highlight ? '#EF4444' : 'var(--color-text-primary)', margin: 0 }}>{item.value}</p>
                {(item as any).sub && <p style={{ fontSize: '10px', color: 'var(--color-text-dim)', margin: '2px 0 0' }}>{(item as any).sub}</p>}
              </div>
            ))}
          </div>

          {/* Action Buttons — prominent and clear */}
          {(isAssignee || isManager) && task.status !== 'completed' && task.status !== 'cancelled' && (
            <div style={{ marginBottom: '20px', padding: '16px', background: 'linear-gradient(135deg, rgba(124,58,237,0.05), rgba(59,130,246,0.05))', borderRadius: '14px', border: '1px solid var(--chat-border)' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-dim)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</p>
              <div className="flex gap-2 flex-wrap">
                {/* Accept / Start Working */}
                {task.status === 'pending' && isAssignee && (
                  <button onClick={() => onStatusChange(task.id, 'in_progress')} style={{ ...actionBtnNew('#10B981'), flex: 1 }}>
                    <CheckCircle2 size={15} /> Accept & Start
                  </button>
                )}
                {task.status === 'pending' && isAssignee && (
                  <button onClick={() => onStatusChange(task.id, 'cancelled')} style={{ ...actionBtnNew('#EF4444'), flex: 1 }}>
                    <X size={15} /> Decline
                  </button>
                )}
                {task.status === 'pending' && isManager && !isAssignee && (
                  <button onClick={() => onStatusChange(task.id, 'in_progress')} style={{ ...actionBtnNew('#3B82F6'), flex: 1 }}>
                    <AlertCircle size={15} /> Mark In Progress
                  </button>
                )}
                {/* Complete */}
                {task.status === 'in_progress' && (
                  <button onClick={() => onStatusChange(task.id, 'completed')} style={{ ...actionBtnNew('#10B981'), flex: 1 }}>
                    <CheckCircle2 size={15} /> Mark Complete
                  </button>
                )}
                {/* Reopen */}
                {task.status === 'in_progress' && isManager && (
                  <button onClick={() => onStatusChange(task.id, 'pending')} style={{ ...actionBtnNew('#F59E0B') }}>
                    <Clock size={15} /> Reset to Pending
                  </button>
                )}
                {/* Cancel */}
                {isManager && task.status !== 'cancelled' && (
                  <button onClick={() => onStatusChange(task.id, 'cancelled')} style={{ ...actionBtnNew('#6B7280') }}>
                    <X size={15} /> Cancel Task
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Completed / Cancelled banner */}
          {task.status === 'completed' && (
            <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#10B98115', borderRadius: '12px', border: '1px solid #10B98130' }}>
              <p className="flex items-center gap-2" style={{ fontSize: '13px', fontWeight: 600, color: '#10B981', margin: 0 }}>
                <CheckCircle2 size={16} /> Task completed {task.completedAt && `on ${new Date(task.completedAt).toLocaleDateString()}`}
              </p>
            </div>
          )}
          {task.status === 'cancelled' && (
            <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#6B728015', borderRadius: '12px', border: '1px solid #6B728030' }}>
              <p className="flex items-center gap-2" style={{ fontSize: '13px', fontWeight: 600, color: '#6B7280', margin: 0 }}>
                <X size={16} /> Task was cancelled
              </p>
              {isManager && (
                <button onClick={() => onStatusChange(task.id, 'pending')} className="flex items-center gap-1" style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '6px' }}>
                  <Clock size={12} /> Reopen task
                </button>
              )}
            </div>
          )}

          {/* Comments */}
          <div style={{ borderTop: '1px solid var(--chat-border)', paddingTop: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Activity ({task.comments?.length || 0})
            </p>
            <div style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '12px' }}>
              {(task.comments || []).length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--color-text-dim)', textAlign: 'center', padding: '20px' }}>No activity yet. Add a comment to get started.</p>
              ) : (
                task.comments.map(c => (
                  <div key={c.id} style={{ padding: '10px 12px', background: 'var(--chat-hover)', borderRadius: '10px', marginBottom: '6px', borderLeft: '2px solid var(--color-primary)' }}>
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{c.user?.name}</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-text-dim)' }}>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '4px 0 0', lineHeight: 1.5 }}>{c.content}</p>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Write an update..."
                onKeyDown={e => e.key === 'Enter' && onAddComment(task.id)}
                style={{ ...inputStyle, flex: 1, borderRadius: '12px' }}
              />
              <button onClick={() => onAddComment(task.id)} style={{ padding: '10px 14px', borderRadius: '12px', background: 'var(--color-primary)', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                <Send size={13} /> Send
              </button>
            </div>
          </div>

          {/* Delete — bottom right, subtle */}
          {isCreator && (
            <div className="flex justify-end" style={{ marginTop: '16px' }}>
              <button onClick={() => { if (confirm('Delete this task permanently?')) onDelete(task.id) }} className="flex items-center gap-1" style={{ fontSize: '11px', color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7 }}>
                <Trash2 size={11} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '10px', fontSize: '13px',
  background: 'var(--chat-hover)', border: '1px solid var(--chat-border)',
  color: 'var(--color-text-primary)', outline: 'none',
}

const actionBtn = (color: string): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
  background: `${color}20`, color, border: `1px solid ${color}40`, cursor: 'pointer',
})

const actionBtnNew = (color: string): React.CSSProperties => ({
  padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
  background: `${color}15`, color, border: `1px solid ${color}30`, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  transition: 'all 150ms ease',
})
