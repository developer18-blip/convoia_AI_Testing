/**
 * API Response Types
 */
export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * AI Query Request Types
 */
export interface AIQueryRequest {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AICompareRequest {
  models: string[];
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIQueryResponse {
  id: string;
  model: string;
  prompt: string;
  response: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCost: number;
  executionTime: number;
  timestamp: string;
}

/**
 * Auth Request Types
 */
export type UserRole = 'platform_admin' | 'org_owner' | 'manager' | 'employee';

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
  organizationName?: string;
  industry?: string;
  teamSize?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    avatar?: string | null;
    role: string;
    organizationId?: string;
    isVerified: boolean;
  };
  token: string;
  refreshToken?: string;
  requiresVerification?: boolean;
}

/**
 * Usage Statistics Types
 */
export interface UsageStats {
  totalQueries: number;
  totalTokensUsed: number;
  totalCost: number;
  averageCostPerQuery: number;
  queriesByModel: Record<string, number>;
  costByModel: Record<string, number>;
}

export interface DailyUsage {
  date: string;
  queries: number;
  tokensUsed: number;
  cost: number;
}

/**
 * Billing Types
 */
export interface BillingStats {
  currentPlan: string;
  monthlyLimit: number;
  tokensUsedThisMonth: number;
  tokensRemaining: number;
  estimatedMonthlyCharge: number;
  renewalDate: string;
}

/**
 * Admin Dashboard Types
 */
export interface AdminStats {
  totalUsers: number;
  totalOrganizations: number;
  totalQueries: number;
  totalTokensUsed: number;
  totalRevenue: number;
  activeSubscriptions: number;
  newUsersThisMonth: number;
  topModels: Array<{
    modelName: string;
    usageCount: number;
    revenue: number;
  }>;
}

/**
 * Wallet Types
 */
export interface WalletBalance {
  userId: string;
  balance: number;
  totalToppedUp: number;
  totalSpent: number;
  currency: string;
  lastTopedUpAt: string | null;
}

export interface TopUpWalletRequest {
  amount: number;
  stripePaymentId?: string;
}

export interface WalletTransactionRecord {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  reference?: string;
  createdAt: string;
}

export interface TransactionHistoryResponse {
  transactions: WalletTransactionRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Budget Types
 */
export interface BudgetConfig {
  monthlyCap: number;
  currentUsage: number;
  alertThreshold: number;
  autoDowngrade: boolean;
  fallbackModelId?: string;
}

export interface BudgetUsageStats {
  monthlyCap: number;
  currentUsage: number;
  usagePercent: number;
  remainingBudget: number;
  alertThreshold: number;
  alertSent: boolean;
  resetDate: string;
}

export interface SetBudgetRequest {
  monthlyCap: number;
  alertThreshold?: number;
  autoDowngrade?: boolean;
  fallbackModelId?: string;
}

/**
 * Hourly Session Types
 */
export interface HourlySessionRequest {
  modelId: string;
  durationHours: 1 | 3 | 6 | 24;
  amountPaid: number;
}

export interface HourlySessionResponse {
  id: string;
  modelId: string;
  durationHours: number;
  amountPaid: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  timeRemainingMinutes: number;
}

export interface SessionAccessCheck {
  valid: boolean;
  session: HourlySessionResponse | null;
}

/**
 * Organization Hierarchy & User Stats Types
 */
export interface UserInHierarchy {
  id: string;
  email: string;
  name: string;
  role: string;
  employees?: UserInHierarchy[];
}

export interface OrganizationUserTree {
  organizationId: string;
  organizationName: string;
  totalUsers: number;
  hierarchy: UserInHierarchy[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface UserUsageStats {
  userId: string;
  email: string;
  name: string;
  totalQueries: number;
  totalTokensUsed: number;
  totalCost: number;
  topModels: Array<{
    modelName: string;
    usageCount: number;
    tokensCost: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    queries: number;
    tokensUsed: number;
    cost: number;
  }>;
}

export interface OrganizationUsageStats {
  organizationId: string;
  organizationName: string;
  totalUsers: number;
  totalQueries: number;
  totalTokensUsed: number;
  totalCost: number;
  topUsers: Array<{
    userId: string;
    email: string;
    name: string;
    queries: number;
    cost: number;
  }>;
  topModels: Array<{
    modelName: string;
    usageCount: number;
    totalCost: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    queries: number;
    cost: number;
  }>;
}
