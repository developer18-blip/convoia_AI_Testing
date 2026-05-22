import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, ArrowLeft, Trash2 } from 'lucide-react'

const EFFECTIVE_DATE = 'May 9, 2026'
const COMPANY_NAME = 'Convoia AI'
const COMPANY_ENTITY = 'Convoia Inc.'
const CONTACT_EMAIL = 'privacy@convoia.com'
const WEBSITE = 'convoia.ai'

export function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-accent-start to-accent-end p-1.5 rounded-lg">
              <Zap size={18} className="text-white" />
            </div>
            <span className="font-bold text-text-primary">{COMPANY_NAME}</span>
          </Link>
          <Link to="/login" className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft size={14} /> Back to Login
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* Title */}
          <div className="flex items-center gap-3 mb-2">
            <Trash2 size={28} className="text-primary" />
            <h1 className="text-3xl font-bold text-text-primary">Delete Your Convoia AI Account</h1>
          </div>
          <p className="text-text-muted text-sm mb-10">Last Updated: {EFFECTIVE_DATE}</p>

          <div className="prose-custom space-y-8 text-text-secondary text-[15px] leading-relaxed">
            {/* Intro */}
            <section>
              <p>
                You can request permanent deletion of your {COMPANY_NAME} account and the personal data
                associated with it at any time. This page explains how to submit a request, what data is
                deleted, and what we are required to retain.
              </p>
            </section>

            {/* 1. How to request */}
            <section>
              <h2>Option 1 — Delete instantly in the app (fastest)</h2>
              <ol>
                <li>Sign in to the {COMPANY_NAME} app or website.</li>
                <li>Go to <strong>Settings → Danger Zone → Delete Account</strong>.</li>
                <li>Type your account email to confirm, then tap <strong>Delete Forever</strong>.</li>
              </ol>
              <p>
                Your account and associated personal data are deleted immediately and you are signed out.
                This action is permanent and cannot be undone.
              </p>

              <h2>Option 2 — Request deletion by email</h2>
              <ol>
                <li>From the email address registered on your {COMPANY_NAME} account, send an email to <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.</li>
                <li>Use the subject line: <code>Account Deletion Request</code></li>
                <li>Include your registered email address in the body of the message so we can confirm the request.</li>
              </ol>
              <p>
                We will verify the request originated from the registered email and complete deletion
                within 30 days. You will receive a confirmation email once the deletion is complete.
              </p>
              <p className="text-sm text-text-muted">
                Note: organization owners cannot self-delete in the app (it would orphan the organization and its members).
                Please transfer ownership first, or email us and we will assist.
              </p>
            </section>

            {/* 2. What gets deleted */}
            <section>
              <h2>What gets deleted</h2>
              <ul>
                <li><strong>Account</strong> — email address, name, password, and profile information.</li>
                <li><strong>Conversations and messages</strong> — your full chat history with all AI models.</li>
                <li><strong>Usage logs and analytics data</strong> — per-query records, token consumption, and model selection history.</li>
                <li><strong>Token wallet and transaction history</strong> — your wallet balance and personal purchase records, subject to financial record retention requirements described below.</li>
                <li><strong>All associated user data</strong> — API keys, saved preferences, uploaded files, and any other data linked to your account.</li>
              </ul>
            </section>

            {/* 3. What is retained */}
            <section>
              <h2>What is retained</h2>
              <ul>
                <li><strong>Anonymized aggregate analytics</strong> — counts and trends in a form that cannot be linked back to you.</li>
                <li><strong>Financial records required by law</strong> — invoices and tax-relevant transaction metadata, typically retained for 7 years to comply with U.S. tax and audit requirements.</li>
                <li><strong>Server logs</strong> — typically retained for 30–90 days, then auto-purged.</li>
              </ul>
              <p>
                For full details on data handling and retention, see our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
              </p>
            </section>

            {/* 4. Need help */}
            <section>
              <h2>Need help?</h2>
              <p>
                If you have questions about deletion, want to verify the status of a previously-submitted
                request, or need help retrieving your data first, email us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
              </p>
              <div className="bg-surface/80 border border-border/50 rounded-xl p-4 mt-3">
                <p className="font-semibold text-text-primary">{COMPANY_ENTITY}</p>
                <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a></p>
                <p>Website: <a href={`https://${WEBSITE}`} className="text-primary hover:underline">{WEBSITE}</a></p>
              </div>
            </section>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-16">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-text-muted">
          <span>&copy; {new Date().getFullYear()} {COMPANY_ENTITY}. All rights reserved.</span>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-text-secondary transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-text-secondary transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>

      <style>{`
        .prose-custom h2 { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 0.75rem; }
        .prose-custom h3 { font-size: 1.05rem; font-weight: 600; color: var(--color-text-primary); margin-top: 1rem; margin-bottom: 0.5rem; }
        .prose-custom ul, .prose-custom ol { padding-left: 1.5rem; margin: 0.5rem 0; }
        .prose-custom ul { list-style-type: disc; }
        .prose-custom ol { list-style-type: decimal; }
        .prose-custom li { margin-bottom: 0.35rem; }
        .prose-custom p { margin-bottom: 0.75rem; }
        .prose-custom a { text-decoration: none; }
        .prose-custom code { background: var(--color-surface-2); padding: 1px 6px; border-radius: 4px; font-size: 0.92em; font-family: ui-monospace, monospace; color: var(--color-text-primary); }
      `}</style>
    </div>
  )
}

export default AccountDeletionPage
