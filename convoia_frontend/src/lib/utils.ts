export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatCurrency(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(isNaN(n) ? 0 : n)
}

export function formatNumber(num: number | null | undefined): string {
  const n = num ?? 0
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function formatTokens(tokens: number | string | null | undefined): string {
  const raw = Number(tokens ?? 0)
  const t = isNaN(raw) ? 0 : raw
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(2)}M`
  if (t >= 1_000) return `${(t / 1_000).toFixed(1)}K`
  return t.toString()
}

// Reads the user's saved timezone from Settings → Profile → Timezone.
// Empty string = "auto-detect from browser" (omit the timeZone option, which
// makes Intl fall back to the browser's local zone). All date helpers below
// route through this so a single Settings change reformats every timestamp
// in the app — chat list, message bubbles, usage, dashboard, etc.
function getUserTimeZone(): string | undefined {
  try {
    const tz = localStorage.getItem('convoia_settings_timezone')
    return tz && tz.length > 0 ? tz : undefined
  } catch { return undefined }
}

export function formatDate(dateStr: string): string {
  const timeZone = getUserTimeZone()
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  })
}

export function formatDateTime(dateStr: string): string {
  const timeZone = getUserTimeZone()
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  })
}

// Time-only — used by chat message timestamps. Honors timezone too so a user
// in Tokyo viewing a message sent at 14:00 UTC sees 23:00 (their local time
// in their chosen zone), not 14:00.
export function formatTime(dateStr: string): string {
  const timeZone = getUserTimeZone()
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  })
}

// Short date — "Apr 5" with no year. For tight UIs (task cards, mobile
// conversation rows) where year would be redundant.
export function formatDateShort(dateStr: string): string {
  const timeZone = getUserTimeZone()
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  })
}

export function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateStr)
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

  if (hour >= 0 && hour < 4) return pick([
    'Night owl, still grinding',
    'Burning the midnight oil',
    'Up late and building',
    'The world sleeps, you create',
  ])
  if (hour < 6) return pick([
    'Early riser, respect',
    'Up before the sun',
    'The early bird catches the worm',
    'Dawn warrior, let\'s go',
  ])
  if (hour < 9) return pick([
    'Rise and shine',
    'Fresh start today',
    'Morning energy, let\'s build',
    'New day, new possibilities',
  ])
  if (hour < 12) return pick([
    'Good morning',
    'Morning momentum',
    'Let\'s make today count',
    'Productive morning ahead',
  ])
  if (hour < 14) return pick([
    'Good afternoon',
    'Lunch break hustle',
    'Afternoon focus mode',
    'Midday momentum',
  ])
  if (hour < 17) return pick([
    'Afternoon grind',
    'Powering through the day',
    'Keeping the energy up',
    'Finishing strong today',
  ])
  if (hour < 20) return pick([
    'Good evening',
    'Evening productivity',
    'Winding down or warming up',
    'Evening session, let\'s go',
  ])
  return pick([
    'Burning the midnight oil',
    'Night mode activated',
    'Late night builder',
    'Still at it, legend',
  ])
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getAvatarColor(name: string): string {
  const colors = [
    'bg-violet-600',
    'bg-blue-600',
    'bg-emerald-600',
    'bg-amber-600',
    'bg-rose-600',
    'bg-cyan-600',
    'bg-pink-600',
    'bg-indigo-600',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}

export function getProviderColor(provider: string): string {
  const colors: Record<string, string> = {
    openai: '#10B981',
    anthropic: '#D97706',
    google: '#3B82F6',
    deepseek: '#8B5CF6',
    mistral: '#EF4444',
    groq: '#F97316',
  }
  return colors[provider.toLowerCase()] || '#64748B'
}

export function getProviderBgClass(provider: string): string {
  const classes: Record<string, string> = {
    openai: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    anthropic: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    google: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    deepseek: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    mistral: 'bg-red-500/10 text-red-400 border-red-500/20',
    groq: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  }
  return classes[provider.toLowerCase()] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'
}

export function passwordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return { score, label: 'Weak', color: 'bg-danger' }
  if (score <= 3) return { score, label: 'Fair', color: 'bg-warning' }
  if (score <= 4) return { score, label: 'Good', color: 'bg-info' }
  return { score, label: 'Strong', color: 'bg-success' }
}

export function groupByDate<T extends { createdAt?: string; updatedAt?: string; timestamp?: string }>(
  items: T[],
  dateKey: 'createdAt' | 'updatedAt' | 'timestamp' = 'createdAt'
): Record<string, T[]> {
  const groups: Record<string, T[]> = {}
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  for (const item of items) {
    const dateStr = item[dateKey]
    if (!dateStr) continue
    const date = new Date(dateStr)
    date.setHours(0, 0, 0, 0)

    let label: string
    if (date.getTime() === today.getTime()) label = 'Today'
    else if (date.getTime() === yesterday.getTime()) label = 'Yesterday'
    else label = 'Older'

    if (!groups[label]) groups[label] = []
    groups[label].push(item)
  }
  return groups
}
