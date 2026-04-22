export interface User {
  id: string
  email: string
  name: string
  role: 'platform_admin' | 'org_owner' | 'manager' | 'employee' | 'user'
  avatar?: string | null
  organizationId?: string
  organization?: Organization
  isVerified: boolean
  createdAt: string
}

export interface Organization {
  id: string
  name: string
  email: string
  industry?: string
  tier: string
  status: string
  ownerId: string
}

export interface AIModel {
  id: string
  name: string
  provider: string
  modelId: string
  description?: string
  inputTokenPrice: number
  outputTokenPrice: number
  markupPercentage: number
  contextWindow: number
  capabilities: string[]
  isActive: boolean
}

export interface Wallet {
  userId: string
  balance: number
  totalToppedUp: number
  totalSpent: number
  currency: string
  lastTopedUpAt?: string
}

export interface WalletTransaction {
  id: string
  amount: number
  type: 'credit' | 'debit'
  description: string
  reference?: string
  createdAt: string
}

export interface UsageLog {
  id: string
  modelId: string
  model?: AIModel
  prompt: string
  response?: string
  tokensInput: number
  tokensOutput: number
  totalTokens: number
  providerCost: number
  customerPrice: number
  markupPercentage: number
  status: string
  createdAt: string
}

export interface DashboardStats {
  today: { queries: number; cost: number; tokens: number }
  thisWeek: { queries: number; cost: number; tokens: number }
  thisMonth: { queries: number; cost: number; tokens: number }
  lastMonth: { queries: number; cost: number; tokens: number }
  allTime: { queries: number; cost: number }
  topModels: Array<{ name: string; queries: number; cost: number }>
  dailyUsage: Array<{ date: string; cost: number; queries: number }>
  providerBreakdown: Array<{ provider: string; cost: number; queries: number }>
}

export interface Budget {
  id: string
  userId: string
  monthlyCap: number
  currentUsage: number
  alertThreshold: number
  alertSent: boolean
  autoDowngrade: boolean
  fallbackModelId?: string
  resetDate: string
}

export interface HourlySession {
  id: string
  modelId: string
  model?: AIModel
  durationHours: number
  amountPaid: number
  startTime: string
  endTime: string
  isActive: boolean
  isExpired: boolean
}

export interface AgentStep {
  id: string
  type: 'thinking' | 'searching' | 'executing' | 'complete' | 'error'
  title: string
  content: string
  result?: string
  cost?: number
  timestamp: string
}

export interface AgentRun {
  id: string
  task: string
  steps: AgentStep[]
  finalAnswer: string
  totalCost: number
  totalTokens: number
  status: 'running' | 'complete' | 'failed' | 'cancelled'
  startTime: string
  endTime?: string
}

export interface CodeExecution {
  id: string
  language: string
  code: string
  output?: string
  error?: string
  executionTime?: number
  status: 'pending' | 'running' | 'success' | 'error'
}

export interface APIKey {
  id: string
  name: string
  key?: string
  maskedKey: string
  isActive: boolean
  lastUsed?: string
  createdAt: string
  expiresAt?: string
  totalQueries: number
  totalCost: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokensInput?: number
  tokensOutput?: number
  cost?: number
  model?: string
  provider?: string
  timestamp: string
  isLoading?: boolean
  error?: string
  agentRun?: AgentRun
  codeBlocks?: CodeExecution[]
  isEditing?: boolean
  editedContent?: string
  imageUrl?: string
  imagePrompt?: string
  videoUrl?: string
  imagePreview?: string
  imagePreviews?: string[] // multiple images (base64)
  fileAttachment?: {
    name: string
    type: 'image' | 'document' | 'audio' | 'video'
    size: number
  }
  /** Structured attachment ids persisted server-side via /api/files/attach.
   *  The backend resolves these to ConversationAttachment rows when the
   *  message is sent, so the AI can read the file contents across turns. */
  attachmentIds?: string[]
  statusText?: string
  webSearch?: {
    query: string
    sources: { title: string; url: string; image?: string; siteName?: string; snippet?: string }[]
  }
  fileGeneration?: {
    downloadUrl: string
    fileName: string
    fileSize: number
    fileSizeLabel: string
    format: 'pdf' | 'docx' | 'pptx' | 'xlsx' | string
    formatLabel: string
    title: string
  }
  council?: CouncilState
}

export type CouncilPhase =
  | 'executing'       // Phase 1 — models answering in parallel
  | 'crossexam'       // Phase 2 — cross-examination running
  | 'crossexam_done'  // Phase 2 complete, about to start verdict
  | 'verdict'         // Phase 3 — verdict streaming
  | 'complete'        // All phases done — terminal state
  | 'error'

export interface CouncilModelState {
  modelName: string
  modelIndex: number
  status: 'waiting' | 'thinking' | 'complete' | 'error'
  statusMessage: string
  durationMs: number
  tokenCount: number
  error?: string
  startTime: number
}

export interface CouncilModelResponse {
  name: string
  response: string
  durationMs: number
  tokens: number
}

export interface CouncilMeta {
  totalTokens: number
  totalCost: string
  totalDurationMs: number
  crossExamDurationMs: number
  verdictDurationMs: number
  modelsUsed: number
}

export interface CouncilState {
  phase: CouncilPhase
  userQuery: string
  models: CouncilModelState[]
  verdict: string
  modelResponses: CouncilModelResponse[]
  crossExamStatus: string
  crossExamDurationMs: number
  meta: CouncilMeta | null
  errorMessage?: string
}

export interface ChatFolder {
  id: string
  name: string
}

export interface Conversation {
  id: string
  title: string
  modelId: string
  modelName: string
  industry?: string
  messages: Message[]
  totalCost: number
  totalTokens: number
  createdAt: string
  updatedAt: string
  isPinned?: boolean
  folderId?: string
  _draft?: boolean // not yet synced to backend (created locally, no messages sent)
}

export interface Agent {
  id: string
  name: string
  role: string
  avatar: string
  description?: string
  systemPrompt: string
  personality: string
  defaultModelId?: string
  defaultModel?: { id: string; name: string; provider: string }
  temperature: number
  maxTokens: number
  topP: number
  industry?: string
  isDefault: boolean
  isActive: boolean
  userId?: string
  organizationId?: string
  createdAt: string
  updatedAt: string
}

export interface CanvasItem {
  id: string
  type: 'code' | 'text'
  title: string
  content: string
  language?: string
  messageId?: string
  createdAt: string
  updatedAt: string
}

export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
  timestamp: string
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

export interface InsightData {
  type: 'warning' | 'tip' | 'success' | 'info'
  title: string
  description: string
  icon: string
  action?: { label: string; onClick: () => void }
}
