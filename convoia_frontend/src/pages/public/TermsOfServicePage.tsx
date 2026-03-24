import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, ArrowLeft, FileText } from 'lucide-react'

const EFFECTIVE_DATE = 'March 23, 2026'
const COMPANY_NAME = 'ConvoiaAI'
const COMPANY_ENTITY = 'Convoia Inc.'
const CONTACT_EMAIL = 'legal@convoia.com'
const WEBSITE = 'convoia.com'

export function TermsOfServicePage() {
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
            <FileText size={28} className="text-primary" />
            <h1 className="text-3xl font-bold text-text-primary">Terms of Service</h1>
          </div>
          <p className="text-text-muted text-sm mb-10">Effective Date: {EFFECTIVE_DATE} | Last Updated: {EFFECTIVE_DATE}</p>

          <div className="prose-custom space-y-8 text-text-secondary text-[15px] leading-relaxed">
            {/* Intro */}
            <section>
              <p>
                Welcome to {COMPANY_NAME}. These Terms of Service ("Terms") constitute a legally binding agreement between
                you ("User", "you", or "your") and {COMPANY_ENTITY} ("Company", "we", "us", or "our") governing your access
                to and use of the {WEBSITE} platform and related services (the "Service").
              </p>
              <p>
                <strong>By creating an account or using the Service, you agree to be bound by these Terms.</strong> If you
                do not agree to these Terms, do not use the Service.
              </p>
            </section>

            {/* 1 */}
            <section>
              <h2>1. Eligibility</h2>
              <ul>
                <li>You must be at least 18 years old to create an account and use the Service independently.</li>
                <li>Users between 13 and 18 may use the Service only with verified parental or guardian consent.</li>
                <li>The Service is not available to children under 13 in compliance with COPPA.</li>
                <li>By using the Service, you represent that you meet the eligibility requirements and have the legal authority to enter into these Terms.</li>
                <li>If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.</li>
              </ul>
            </section>

            {/* 2 */}
            <section>
              <h2>2. Account Registration</h2>
              <ul>
                <li>You may register using email/password or through Google Sign-In.</li>
                <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                <li>You are responsible for all activity that occurs under your account.</li>
                <li>You agree to provide accurate, current, and complete registration information.</li>
                <li>You must notify us immediately of any unauthorized use of your account.</li>
                <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
              </ul>
            </section>

            {/* 3 */}
            <section>
              <h2>3. Service Description</h2>
              <p>
                {COMPANY_NAME} is a B2B AI gateway platform that provides access to multiple artificial intelligence
                models through a unified interface. The Service includes:
              </p>
              <ul>
                <li>Access to AI models from multiple providers (OpenAI, Anthropic, Google, and others)</li>
                <li>A token-based usage system for managing AI consumption</li>
                <li>Organization management with role-based access controls</li>
                <li>Image generation capabilities through supported providers</li>
                <li>Team collaboration features with token allocation</li>
                <li>Usage analytics and reporting</li>
              </ul>
            </section>

            {/* 4 */}
            <section>
              <h2>4. Token System and Payments</h2>

              <h3>4.1 Token Purchases</h3>
              <ul>
                <li>Access to AI models requires tokens, which are purchased through our platform via Stripe.</li>
                <li>Token packages are available at prices listed on the Token Store page at the time of purchase.</li>
                <li>All prices are in U.S. Dollars (USD) and are subject to change with notice.</li>
                <li>Tokens are non-transferable outside of organizational allocation.</li>
              </ul>

              <h3>4.2 Refund Policy</h3>
              <ul>
                <li>Token purchases are generally non-refundable once credited to your account.</li>
                <li>If you experience a technical issue that results in token loss not caused by normal usage, contact support within 7 days for review.</li>
                <li>We reserve the right to issue refunds or token credits at our sole discretion.</li>
              </ul>

              <h3>4.3 Organization Token Allocation</h3>
              <ul>
                <li>Organization owners may allocate tokens to team members.</li>
                <li>Allocated tokens are deducted from the allocator's balance.</li>
                <li>Organization members (employees/managers) cannot purchase tokens directly.</li>
              </ul>
            </section>

            {/* 5 */}
            <section>
              <h2>5. Acceptable Use</h2>
              <p>You agree not to use the Service to:</p>
              <ul>
                <li>Generate content that is illegal, harmful, threatening, abusive, defamatory, or otherwise objectionable</li>
                <li>Generate content that exploits, harms, or targets minors</li>
                <li>Generate malware, phishing content, spam, or other malicious content</li>
                <li>Violate any applicable law, regulation, or third-party rights</li>
                <li>Attempt to reverse-engineer, decompile, or disassemble the Service</li>
                <li>Circumvent rate limits, access controls, or security measures</li>
                <li>Use automated means (bots, scrapers) to access the Service without authorization</li>
                <li>Impersonate any person or entity, or misrepresent your affiliation</li>
                <li>Share your account credentials with unauthorized users</li>
                <li>Resell access to the Service without our written consent</li>
              </ul>
              <p>
                We reserve the right to suspend or terminate your account immediately if we determine, at our sole
                discretion, that you have violated these acceptable use provisions.
              </p>
            </section>

            {/* 6 */}
            <section>
              <h2>6. AI-Generated Content</h2>
              <ul>
                <li><strong>No Warranty on AI Output:</strong> AI-generated content is provided "as is". We do not guarantee the accuracy, completeness, reliability, or suitability of any AI-generated output.</li>
                <li><strong>Your Responsibility:</strong> You are solely responsible for reviewing, verifying, and using AI-generated content. Do not rely on AI output for medical, legal, financial, or safety-critical decisions without professional verification.</li>
                <li><strong>Ownership:</strong> Subject to the terms of the underlying AI providers, you retain rights to the output generated through your use of the Service, to the extent permitted by applicable law.</li>
                <li><strong>No Training:</strong> We do not use your input or output data to train AI models. Third-party AI providers may have their own data usage policies.</li>
              </ul>
            </section>

            {/* 7 */}
            <section>
              <h2>7. Intellectual Property</h2>
              <ul>
                <li>The Service, including its design, features, logos, and documentation, is owned by {COMPANY_ENTITY} and protected by U.S. and international intellectual property laws.</li>
                <li>You retain ownership of content you submit to the Service (input data).</li>
                <li>We grant you a limited, non-exclusive, non-transferable license to use the Service in accordance with these Terms.</li>
                <li>You may not copy, modify, distribute, or create derivative works based on the Service without our written consent.</li>
              </ul>
            </section>

            {/* 8 */}
            <section>
              <h2>8. Third-Party Services</h2>
              <p>
                The Service relies on third-party AI providers and payment processors. Your use of AI models is
                additionally subject to the terms of service of the respective providers:
              </p>
              <ul>
                <li>OpenAI — <a href="https://openai.com/policies/terms-of-use" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Terms of Use</a></li>
                <li>Anthropic — <a href="https://www.anthropic.com/legal/consumer-terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Consumer Terms</a></li>
                <li>Google — <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Terms of Service</a></li>
                <li>Stripe — <a href="https://stripe.com/legal/end-users" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Services Agreement</a></li>
              </ul>
            </section>

            {/* 9 */}
            <section>
              <h2>9. Service Availability</h2>
              <ul>
                <li>We strive to maintain high availability but do not guarantee uninterrupted access to the Service.</li>
                <li>The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control.</li>
                <li>Third-party AI provider outages may affect the availability of specific models.</li>
                <li>We are not liable for any loss or damage resulting from Service interruptions.</li>
              </ul>
            </section>

            {/* 10 */}
            <section>
              <h2>10. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
              </p>
              <ul>
                <li>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</li>
                <li>IN NO EVENT SHALL {COMPANY_ENTITY} BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR GOODWILL.</li>
                <li>OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM OR RELATED TO THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.</li>
                <li>SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES. IN SUCH CASES, OUR LIABILITY SHALL BE LIMITED TO THE FULLEST EXTENT PERMITTED BY LAW.</li>
              </ul>
            </section>

            {/* 11 */}
            <section>
              <h2>11. Indemnification</h2>
              <p>
                You agree to indemnify, defend, and hold harmless {COMPANY_ENTITY}, its officers, directors, employees,
                and agents from and against any claims, liabilities, damages, losses, costs, or expenses (including
                reasonable attorneys' fees) arising out of or related to:
              </p>
              <ul>
                <li>Your use of the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any third-party rights</li>
                <li>Content generated through your use of the Service</li>
              </ul>
            </section>

            {/* 12 */}
            <section>
              <h2>12. Termination</h2>
              <ul>
                <li>You may terminate your account at any time by contacting support or using account settings.</li>
                <li>We may suspend or terminate your access at any time for violation of these Terms, with or without notice.</li>
                <li>Upon termination, your right to use the Service ceases immediately.</li>
                <li>Unused tokens are non-refundable upon termination, except where required by applicable law.</li>
                <li>Sections that by their nature should survive termination (including Limitation of Liability, Indemnification, and Governing Law) shall survive.</li>
              </ul>
            </section>

            {/* 13 */}
            <section>
              <h2>13. Governing Law and Dispute Resolution</h2>
              <ul>
                <li>These Terms are governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to conflict of law principles.</li>
                <li>Any disputes arising from these Terms or the Service shall first be attempted to be resolved through good-faith negotiation for 30 days.</li>
                <li>If negotiation fails, disputes shall be resolved through binding arbitration administered by the American Arbitration Association (AAA) under its Commercial Arbitration Rules.</li>
                <li>Arbitration shall take place in Delaware or remotely, at the parties' agreement.</li>
                <li>You agree to waive any right to participate in a class action lawsuit or class-wide arbitration.</li>
                <li>Notwithstanding the above, either party may seek injunctive relief in a court of competent jurisdiction.</li>
              </ul>
            </section>

            {/* 14 */}
            <section>
              <h2>14. Modifications to Terms</h2>
              <p>
                We reserve the right to modify these Terms at any time. We will provide notice of material changes
                by posting the updated Terms on this page and updating the "Last Updated" date. For significant changes,
                we may also notify registered users via email.
              </p>
              <p>
                Your continued use of the Service after modifications constitutes acceptance of the updated Terms.
                If you disagree with the changes, you should discontinue use of the Service and contact us to close
                your account.
              </p>
            </section>

            {/* 15 */}
            <section>
              <h2>15. Miscellaneous</h2>
              <ul>
                <li><strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy, constitute the entire agreement between you and {COMPANY_ENTITY} regarding the Service.</li>
                <li><strong>Severability:</strong> If any provision of these Terms is found invalid or unenforceable, the remaining provisions remain in full force and effect.</li>
                <li><strong>Waiver:</strong> Our failure to enforce any provision does not constitute a waiver of that provision.</li>
                <li><strong>Assignment:</strong> You may not assign your rights under these Terms without our written consent. We may assign our rights at any time.</li>
                <li><strong>Force Majeure:</strong> We are not liable for delays or failures resulting from circumstances beyond our reasonable control.</li>
              </ul>
            </section>

            {/* 16 */}
            <section>
              <h2>16. Contact Us</h2>
              <p>For questions about these Terms of Service:</p>
              <div className="bg-surface/80 border border-border/50 rounded-xl p-4 mt-2">
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
        .prose-custom ul { list-style-type: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        .prose-custom li { margin-bottom: 0.35rem; }
        .prose-custom p { margin-bottom: 0.75rem; }
        .prose-custom a { text-decoration: none; }
      `}</style>
    </div>
  )
}

export default TermsOfServicePage
