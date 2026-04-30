import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, ArrowLeft, Shield } from 'lucide-react'

const EFFECTIVE_DATE = 'March 23, 2026'
const COMPANY_NAME = 'ConvoiaAI'
const COMPANY_ENTITY = 'Convoia Inc.'
const CONTACT_EMAIL = 'privacy@convoia.com'
const WEBSITE = 'convoia.ai'

export function PrivacyPolicyPage() {
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
            <Shield size={28} className="text-primary" />
            <h1 className="text-3xl font-bold text-text-primary">Privacy Policy</h1>
          </div>
          <p className="text-text-muted text-sm mb-10">Effective Date: {EFFECTIVE_DATE} | Last Updated: {EFFECTIVE_DATE}</p>

          <div className="prose-custom space-y-8 text-text-secondary text-[15px] leading-relaxed">
            {/* Intro */}
            <section>
              <p>
                {COMPANY_ENTITY} ("{COMPANY_NAME}", "we", "us", or "our") operates the {WEBSITE} platform and related services
                (collectively, the "Service"). This Privacy Policy describes how we collect, use, disclose, and protect your
                personal information when you access or use our Service.
              </p>
              <p>
                We are committed to protecting your privacy and complying with applicable U.S. federal and state privacy
                laws, including the California Consumer Privacy Act (CCPA/CPRA), the Children's Online Privacy Protection
                Act (COPPA), and Federal Trade Commission (FTC) guidelines.
              </p>
            </section>

            {/* 1 */}
            <section>
              <h2>1. Information We Collect</h2>

              <h3>1.1 Information You Provide</h3>
              <ul>
                <li><strong>Account Information:</strong> Name, email address, and password when you create an account.</li>
                <li><strong>Google OAuth Data:</strong> If you sign in with Google, we receive your name, email, and profile picture from Google. We do not receive or store your Google password.</li>
                <li><strong>Organization Information:</strong> Company name and industry if you create a team account.</li>
                <li><strong>Payment Information:</strong> When you purchase tokens, payment is processed by Stripe. We do not store your credit card numbers. We retain transaction IDs and purchase amounts for billing records.</li>
                <li><strong>Communications:</strong> Information you provide when contacting support.</li>
              </ul>

              <h3>1.2 Information Collected Automatically</h3>
              <ul>
                <li><strong>Usage Data:</strong> AI model queries, token consumption, session timestamps, and feature usage patterns.</li>
                <li><strong>Device Information:</strong> Browser type, operating system, IP address, and general location (city/state level).</li>
                <li><strong>Cookies:</strong> We use essential cookies for authentication (JWT tokens stored in localStorage). We do not use tracking cookies or third-party advertising cookies.</li>
              </ul>

              <h3>1.3 AI Interaction Data</h3>
              <p>
                When you use our AI gateway to send queries, we may temporarily process the content of your messages to
                route them to the appropriate AI provider. <strong>We do not train any AI models on your data.</strong> Your
                queries are forwarded to third-party AI providers (OpenAI, Anthropic, Google, etc.) subject to their
                respective privacy policies.
              </p>
            </section>

            {/* 2 */}
            <section>
              <h2>2. How We Use Your Information</h2>
              <p>We use collected information for the following purposes:</p>
              <ul>
                <li>To provide, maintain, and improve the Service</li>
                <li>To process token purchases and manage your account balance</li>
                <li>To authenticate your identity and maintain session security</li>
                <li>To send transactional emails (purchase receipts, team invitations, token allocations)</li>
                <li>To monitor usage patterns for billing accuracy and fraud prevention</li>
                <li>To comply with legal obligations and enforce our Terms of Service</li>
                <li>To respond to support requests</li>
              </ul>
              <p>
                <strong>We do not sell your personal information.</strong> We do not use your data for targeted advertising.
              </p>
            </section>

            {/* 3 */}
            <section>
              <h2>3. How We Share Your Information</h2>
              <p>We may share your information with:</p>
              <ul>
                <li><strong>AI Providers:</strong> Your queries are forwarded to third-party AI providers (e.g., OpenAI, Anthropic, Google DeepMind, Mistral, DeepSeek, Groq) to generate responses. Each provider processes your data under their own privacy policy.</li>
                <li><strong>Payment Processors:</strong> Stripe processes your payment information under their <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a>.</li>
                <li><strong>Organization Members:</strong> If you are part of an organization, your name, role, and token usage may be visible to organization owners and managers.</li>
                <li><strong>Legal Requirements:</strong> We may disclose information if required by law, subpoena, or government request, or to protect the rights, safety, or property of {COMPANY_NAME} or others.</li>
              </ul>
              <p>We do not share your information with data brokers, advertising networks, or any third parties for marketing purposes.</p>
            </section>

            {/* 4 */}
            <section>
              <h2>4. Data Retention</h2>
              <ul>
                <li><strong>Account Data:</strong> Retained as long as your account is active. Upon account deletion request, we delete your personal data within 30 days.</li>
                <li><strong>AI Query Logs:</strong> Usage metadata (model used, token count, timestamps) is retained for up to 12 months for billing and analytics. Query content is not stored permanently.</li>
                <li><strong>Payment Records:</strong> Transaction records are retained for 7 years to comply with U.S. tax and financial regulations.</li>
                <li><strong>Server Logs:</strong> Automatically purged after 90 days.</li>
              </ul>
            </section>

            {/* 5 */}
            <section>
              <h2>5. Your Rights</h2>

              <h3>5.1 All Users</h3>
              <ul>
                <li><strong>Access:</strong> Request a copy of your personal data.</li>
                <li><strong>Correction:</strong> Update or correct inaccurate information via your account settings.</li>
                <li><strong>Deletion:</strong> Request deletion of your account and associated data.</li>
                <li><strong>Data Portability:</strong> Request your data in a machine-readable format.</li>
              </ul>

              <h3>5.2 California Residents (CCPA/CPRA)</h3>
              <p>If you are a California resident, you have additional rights under the CCPA/CPRA:</p>
              <ul>
                <li><strong>Right to Know:</strong> Request details about the categories and specific pieces of personal information we collect.</li>
                <li><strong>Right to Delete:</strong> Request deletion of your personal information, subject to certain exceptions.</li>
                <li><strong>Right to Opt-Out of Sale:</strong> We do not sell your personal information. No opt-out is necessary.</li>
                <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your privacy rights.</li>
                <li><strong>Right to Correct:</strong> Request correction of inaccurate personal information.</li>
                <li><strong>Right to Limit Use of Sensitive Information:</strong> We only use sensitive information for purposes permitted under the CPRA.</li>
              </ul>
              <p>To exercise these rights, contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>. We will respond within 45 days as required by law.</p>

              <h3>5.3 Other State Privacy Laws</h3>
              <p>
                Residents of Virginia (VCDPA), Colorado (CPA), Connecticut (CTDPA), Utah (UCPA), Texas (TDPSA), Oregon (OCPA),
                Montana (MCDPA), and other states with consumer privacy legislation may have similar rights. Contact us to exercise your rights.
              </p>
            </section>

            {/* 6 */}
            <section>
              <h2>6. Children's Privacy (COPPA)</h2>
              <p>
                Our Service is not directed to children under 13. We do not knowingly collect personal information from
                children under 13. If you are a parent or guardian and believe your child has provided us with personal
                information, please contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
                We will promptly delete such information.
              </p>
              <p>
                Users between 13 and 18 may use the Service only with the consent and supervision of a parent or legal guardian.
              </p>
            </section>

            {/* 7 */}
            <section>
              <h2>7. Data Security</h2>
              <p>We implement industry-standard security measures to protect your data:</p>
              <ul>
                <li>Passwords are hashed using bcrypt with salt rounds</li>
                <li>All data transmitted over HTTPS/TLS encryption</li>
                <li>JWT-based authentication with short-lived access tokens and refresh token rotation</li>
                <li>Database access restricted with role-based access controls</li>
                <li>Rate limiting on authentication endpoints to prevent brute-force attacks</li>
                <li>Payment data handled exclusively by PCI-DSS compliant Stripe</li>
              </ul>
              <p>
                While we take reasonable measures to protect your data, no method of electronic transmission or storage
                is 100% secure. We cannot guarantee absolute security.
              </p>
            </section>

            {/* 8 */}
            <section>
              <h2>8. Third-Party Services</h2>
              <p>Our Service integrates with third-party providers. Each has their own privacy practices:</p>
              <ul>
                <li><strong>OpenAI</strong> — <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a></li>
                <li><strong>Anthropic</strong> — <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a></li>
                <li><strong>Google (Gemini)</strong> — <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a></li>
                <li><strong>Stripe</strong> — <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a></li>
                <li><strong>Google Sign-In</strong> — <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a></li>
              </ul>
            </section>

            {/* 9 */}
            <section>
              <h2>9. Do Not Track</h2>
              <p>
                Our Service does not currently respond to "Do Not Track" (DNT) browser signals. However, we do not
                engage in cross-site tracking or targeted advertising.
              </p>
            </section>

            {/* 10 */}
            <section>
              <h2>10. International Users</h2>
              <p>
                Our Service is operated from the United States. If you access the Service from outside the U.S., your
                information may be transferred to and processed in the United States, where privacy laws may differ from
                your jurisdiction. By using the Service, you consent to this transfer.
              </p>
            </section>

            {/* 11 */}
            <section>
              <h2>11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of material changes by posting
                the updated policy on this page and updating the "Last Updated" date. For significant changes, we may
                also notify you via email. Your continued use of the Service after changes constitutes acceptance of
                the updated policy.
              </p>
            </section>

            {/* 12 */}
            <section>
              <h2>12. Contact Us</h2>
              <p>If you have questions, concerns, or requests regarding this Privacy Policy or your personal data, contact us at:</p>
              <div className="bg-surface/80 border border-border/50 rounded-xl p-4 mt-2">
                <p className="font-semibold text-text-primary">{COMPANY_ENTITY}</p>
                <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a></p>
                <p>Website: <a href={`https://${WEBSITE}`} className="text-primary hover:underline">{WEBSITE}</a></p>
              </div>
              <p className="mt-3 text-sm text-text-muted">
                For CCPA/CPRA data requests, please include "Privacy Rights Request" in the subject line. We will verify
                your identity before processing any request and respond within the legally required timeframe.
              </p>
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
        .prose-custom ul { list-style-type: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        .prose-custom li { margin-bottom: 0.35rem; }
        .prose-custom p { margin-bottom: 0.75rem; }
        .prose-custom a { text-decoration: none; }
      `}</style>
    </div>
  )
}

export default PrivacyPolicyPage
