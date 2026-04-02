import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { WalletProvider } from './contexts/WalletContext'
import { TokenProvider } from './contexts/TokenContext'
import { ChatProvider } from './contexts/ChatContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer } from './components/ui/Toast'
import { AppShell } from './components/layout/AppShell'
import { LoadingPage } from './components/shared/LoadingPage'
import { useAuth } from './hooks/useAuth'
import { useToast } from './hooks/useToast'

// Lazy-loaded pages
const LandingPage = lazy(() => import('./pages/public/LandingPage'))
const LoginPage = lazy(() => import('./pages/public/LoginPage'))
const RegisterPage = lazy(() => import('./pages/public/RegisterPage'))
const VerifyEmailPage = lazy(() => import('./pages/public/VerifyEmailPage'))
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const ModelsPage = lazy(() => import('./pages/ModelsPage'))
const WalletPage = lazy(() => import('./pages/WalletPage'))
const UsagePage = lazy(() => import('./pages/UsagePage'))
const SessionsPage = lazy(() => import('./pages/SessionsPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const MemberPage = lazy(() => import('./pages/MemberPage'))
const BudgetsPage = lazy(() => import('./pages/BudgetsPage'))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const OrgPage = lazy(() => import('./pages/OrgPage'))
const OrgBillingPage = lazy(() => import('./pages/OrgBillingPage'))
const OrgAnalyticsPage = lazy(() => import('./pages/OrgAnalyticsPage'))
const AdminOrgsPage = lazy(() => import('./pages/AdminOrgsPage'))
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'))
const AdminModelsPage = lazy(() => import('./pages/AdminModelsPage'))
const AdminRevenuePage = lazy(() => import('./pages/AdminRevenuePage'))
const AdminUserDetailPage = lazy(() => import('./pages/AdminUserDetailPage'))
const AdminOrgDetailPage = lazy(() => import('./pages/AdminOrgDetailPage'))
const AdminCreateAccountPage = lazy(() => import('./pages/AdminCreateAccountPage'))
const AdminSendTokensPage = lazy(() => import('./pages/AdminSendTokensPage'))
const AdminFullAnalyticsPage = lazy(() => import('./pages/AdminFullAnalyticsPage'))
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage'))
const ApiDocsPage = lazy(() => import('./pages/ApiDocsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const JoinPage = lazy(() => import('./pages/JoinPage'))
const TokenStorePage = lazy(() => import('./pages/TokenStorePage'))
const PaymentSuccessPage = lazy(() => import('./pages/PaymentSuccessPage'))
const PaymentCancelPage = lazy(() => import('./pages/PaymentCancelPage'))
const PrivacyPolicyPage = lazy(() => import('./pages/public/PrivacyPolicyPage'))
const TermsOfServicePage = lazy(() => import('./pages/public/TermsOfServicePage'))
const ResetPasswordPage = lazy(() => import('./pages/public/ResetPasswordPage'))

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <AppShell />
}

function RoleGuard({ allowedRoles }: { allowedRoles: string[] }) {
  const { user } = useAuth()
  const toast = useToast()

  if (!user || !allowedRoles.includes(user.role)) {
    toast.error('This page is not available for your role.')
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

/**
 * Guard: only allow users who can BUY tokens (freelancers, org_owner, platform_admin)
 * Employees and managers must receive tokens via allocation.
 */
function TokenBuyGuard() {
  const { user } = useAuth()
  const toast = useToast()

  const canBuy = !user?.organizationId || user?.role === 'user' || user?.role === 'org_owner' || user?.role === 'platform_admin'
  if (!canBuy) {
    toast.error('Ask your organization owner to allocate tokens.')
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

/**
 * Guard: only allow users WITHOUT an organization (freelancers)
 */
function FreelancerGuard() {
  const { user } = useAuth()
  const toast = useToast()

  if (user?.organizationId) {
    toast.error('This page is not available for your role.')
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

/**
 * Guard: only allow users without org OR org_owner/platform_admin
 */
function SessionGuard() {
  const { user } = useAuth()
  const toast = useToast()

  const canAccess = !user?.organizationId || user?.role === 'org_owner' || user?.role === 'platform_admin'
  if (!canAccess) {
    toast.error('This page is not available for your role.')
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/usage" element={<UsagePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/api-docs" element={<ApiDocsPage />} />
          {/* Token purchase — only freelancers + org_owner + platform_admin */}
          <Route element={<TokenBuyGuard />}>
            <Route path="/tokens/buy" element={<TokenStorePage />} />
          </Route>
          <Route path="/payment/success" element={<PaymentSuccessPage />} />
          <Route path="/payment/cancel" element={<PaymentCancelPage />} />

          {/* Wallet — only freelancers (no org) */}
          <Route element={<FreelancerGuard />}>
            <Route path="/wallet" element={<WalletPage />} />
          </Route>
          {/* API Keys — all authenticated users */}
          <Route path="/api-keys" element={<ApiKeysPage />} />

          {/* Sessions — freelancers OR org_owner/platform_admin */}
          <Route element={<SessionGuard />}>
            <Route path="/sessions" element={<SessionsPage />} />
          </Route>

          {/* Budget page — employees can see their own */}
          <Route path="/budget" element={<BudgetsPage />} />
          <Route path="/tasks" element={<TasksPage />} />

          {/* Manager+ */}
          <Route element={<RoleGuard allowedRoles={['manager', 'org_owner', 'platform_admin']} />}>
            <Route path="/team" element={<TeamPage />} />
            <Route path="/team/:userId" element={<MemberPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
          </Route>

          {/* Org Owner+ */}
          <Route element={<RoleGuard allowedRoles={['org_owner', 'platform_admin']} />}>
            <Route path="/org" element={<OrgPage />} />
            <Route path="/org/billing" element={<OrgBillingPage />} />
            <Route path="/org/analytics" element={<OrgAnalyticsPage />} />
            <Route path="/tokens" element={<OrgPage />} />
          </Route>

          {/* Platform Admin */}
          <Route element={<RoleGuard allowedRoles={['platform_admin']} />}>
            <Route path="/admin" element={<DashboardPage />} />
            <Route path="/admin/orgs" element={<AdminOrgsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
            <Route path="/admin/orgs/:orgId" element={<AdminOrgDetailPage />} />
            <Route path="/admin/models" element={<AdminModelsPage />} />
            <Route path="/admin/revenue" element={<AdminRevenuePage />} />
            <Route path="/admin/analytics" element={<AdminFullAnalyticsPage />} />
            <Route path="/admin/create-account" element={<AdminCreateAccountPage />} />
            <Route path="/admin/send-tokens" element={<AdminSendTokensPage />} />
          </Route>
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export default function App() {
  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <ThemeProvider>
          <BrowserRouter>
            <AuthProvider>
              <ToastProvider>
                <WalletProvider>
                  <TokenProvider>
                    <ChatProvider>
                      <AppRoutes />
                      <ToastContainer />
                    </ChatProvider>
                  </TokenProvider>
                </WalletProvider>
              </ToastProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  )
}
