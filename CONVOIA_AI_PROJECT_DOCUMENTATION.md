# ConvoiaAI — Complete Project Documentation

**Last Updated:** April 10, 2026
**Developer:** Anirudh Rai (Applied AI Engineer)
**Repository:** github.com/developer18-blip/convoia_AI_Testing
**Live URL:** https://intellect.convoia.com
**Server:** AWS EC2 (Ubuntu), PM2 process manager, Nginx reverse proxy

---

## 1. WHAT IS CONVOIAAI

ConvoiaAI is a **B2B SaaS AI Gateway Platform** — a unified interface that routes queries to 8+ AI providers (OpenAI, Anthropic, Google, DeepSeek, Mistral, Groq, Perplexity, xAI) through a single API and web interface. It is designed for businesses that need:

- **Multi-model access** — 40+ AI models from 8 providers, one platform
- **Token-based billing** — prepaid token wallet system with 6 pricing tiers ($5–$300)
- **Team management** — organizations, roles (org_owner, manager, employee), token allocation
- **Deep Think Mode** — multi-pass AI reasoning with model-aware prompting
- **Voice conversations** — Whisper STT + OpenAI TTS with continuous voice loop
- **Web search** — Perplexity-powered search augmentation
- **Image/video generation** — DALL-E, Gemini Flash Image, Google Veo 2
- **Document analysis** — PDF/DOCX upload with OCR fallback
- **Usage analytics** — per-user, per-model cost tracking and budgets
- **OpenWebUI compatibility** — drop-in replacement API for OpenWebUI clients

**Business Model:** Token-based prepaid packages with 17% platform margin built into the base rate. No subscriptions — users buy token packages and spend them across any model. Expensive models (Claude Opus, o3) cost more tokens per query; cheap models (Flash, Mini) cost fewer.

---

## 2. TECH STACK

### Backend
- **Runtime:** Node.js (v24+) with Express.js
- **Language:** TypeScript (strict mode, ESM modules)
- **Database:** PostgreSQL via Prisma ORM (27 models)
- **Authentication:** JWT (access + refresh tokens) + Google OAuth
- **Payments:** Stripe (checkout sessions, webhooks)
- **Email:** Resend API
- **File Processing:** multer (upload), pdf-parse v2 (PDF), mammoth (DOCX)
- **AI Providers:** Direct API calls via axios (no SDK wrappers)
- **Process Manager:** PM2
- **Reverse Proxy:** Nginx with SSL

### Frontend
- **Framework:** React 18+ with TypeScript
- **Build Tool:** Vite 8
- **Routing:** React Router v6
- **State:** React Context (Auth, Chat, Theme, Toast, Token, Wallet)
- **Mobile:** Capacitor (Android/iOS) with deep links
- **Styling:** CSS variables + inline styles (no Tailwind/CSS-in-JS)

### Deployment
- **Server:** AWS EC2 Ubuntu instance
- **Database:** PostgreSQL (managed or self-hosted)
- **Domain:** intellect.convoia.com
- **SSL:** Let's Encrypt via Nginx

---

## 3. PROJECT STRUCTURE

### Backend (`backend/src/`)

```
config/          (4 files) — env.ts, db.ts, logger.ts, tokenPackages.ts
middleware/      (10 files) — auth, rate limiting, error handling, upload, validation
routes/          (24 files) — all API endpoint definitions
controllers/     (20 files) — request handlers
services/        (18 files) — business logic (AI gateway, billing, auth, files, etc.)
ai/              (3 files) — modelRegistry, providerPersonalities, thinkModeParams
utils/           (security, token, orgHelper, validators)
prisma/          — schema.prisma (27 models), seed.ts (46 AI models + 8 agents)
```

### Frontend (`convoia_frontend/src/`)

```
pages/           (29 desktop + 7 mobile + 7 public + 5 dashboard views)
components/      — chat/ (15 files), shared/, layout/, VoiceConversationMode
contexts/        (6) — Auth, Chat, Theme, Toast, Token, Wallet
hooks/           (13) — useChat, useModels, useAgents, useVoiceConversation, etc.
lib/             — api.ts, utils.ts, capacitor.ts
types/           — index.ts (all TypeScript interfaces)
```

---

## 4. DATABASE SCHEMA (27 Models)

### Core Business Models
| Model | Purpose |
|-------|---------|
| **Organization** | Company/team account with tier, status, token balance |
| **User** | Individual user with role, auth provider, org membership |
| **APIKey** | User-generated API keys for programmatic access |
| **AIModel** | Registered AI models with provider, pricing, capabilities |

### Billing & Tokens
| Model | Purpose |
|-------|---------|
| **TokenWallet** | Per-user token balance (primary billing) |
| **TokenTransaction** | Purchase/usage/allocation transaction log |
| **TokenPurchase** | Stripe purchase records |
| **TokenAllocation** | Manager-to-employee token allocation |
| **TokenPool** | Organization-level token pool |
| **Wallet** | Legacy fiat wallet (unused, still in schema) |
| **WalletTransaction** | Legacy fiat transactions |
| **Budget** | Monthly spending cap per user |
| **HourlySession** | Time-based session billing |
| **Subscription** | Legacy subscription model (unused) |
| **BillingRecord** | Invoice/payment records |

### AI & Conversations
| Model | Purpose |
|-------|---------|
| **Conversation** | Chat thread with model, agent, cost tracking |
| **ChatMessage** | Individual messages with role, tokens, cost |
| **Agent** | Custom AI personas with system prompt, personality |
| **UserMemory** | Persistent user memories across conversations |
| **UsageLog** | Per-query usage logging (tokens, cost, model) |

### Organization & Team
| Model | Purpose |
|-------|---------|
| **Task** | Team task management (assigned, status, priority) |
| **SubTask** | Task subtasks with completion tracking |
| **TaskComment** | Comments on tasks |
| **OrgInvite** | Organization invite tokens |
| **ActivityLog** | Org-level activity audit trail |
| **Notification** | In-app notifications |
| **Review** | Platform reviews/ratings |

---

## 5. AI PROVIDERS & MODELS (46 Models, 8 Providers)

### OpenAI (15 models)
| Model | ID | Type | Price (in/out per 1M) |
|-------|----|------|----------------------|
| GPT-5.4 | gpt-5.4 | Flagship chat | $5/$15 |
| GPT-5.4 Mini | gpt-5.4-mini | Fast chat | $0.40/$1.60 |
| GPT-5.4 Nano | gpt-5.4-nano | Ultra-fast | $0.10/$0.40 |
| GPT-5 | gpt-5 | Chat | $2/$8 |
| GPT-5 Mini | gpt-5-mini | Fast | $0.30/$1.20 |
| GPT-4.1 | gpt-4.1 | Chat | $2/$8 |
| GPT-4.1 Mini | gpt-4.1-mini | Fast | $0.40/$1.60 |
| GPT-4.1 Nano | gpt-4.1-nano | Ultra-fast | $0.10/$0.40 |
| GPT-4o | gpt-4o | Chat | $2.50/$10 |
| GPT-4o Mini | gpt-4o-mini | Fast | $0.15/$0.60 |
| o3 | o3 | Reasoning | $10/$40 |
| o4 Mini | o4-mini | Fast reasoning | $1.10/$4.40 |
| o3 Mini | o3-mini | Fast reasoning | $1.10/$4.40 |
| GPT Image 1 | gpt-image-1 | Image gen | Per-image |
| DALL-E 3 | dall-e-3 | Image gen | Per-image |

### Anthropic (5 models)
| Model | ID | Type |
|-------|----|------|
| Claude Opus 4.6 | claude-opus-4-6 | Flagship (1M context) |
| Claude Opus 4.5 | claude-opus-4-5-20251101 | Previous flagship |
| Claude Sonnet 4.6 | claude-sonnet-4-6 | Standard (1M context) |
| Claude Sonnet 4.5 | claude-sonnet-4-5-20250929 | Previous standard |
| Claude Haiku 4.5 | claude-haiku-4-5-20251001 | Fast |

### Google (8 models)
| Model | ID | Status |
|-------|----|--------|
| Gemini 3.1 Pro | gemini-3.1-pro-preview | Active (2M context) |
| Gemini 2.5 Pro | gemini-2.5-pro | Active (1M context) |
| Gemini 2.5 Flash | gemini-2.5-flash | Active |
| Gemini 2.5 Flash Lite | gemini-2.5-flash-lite | Active |
| Gemini 2.0 Flash | gemini-2.0-flash | Active |
| Gemini 2.5 Flash Image | gemini-2.5-flash-image | Image gen |
| Gemini 3 Pro | gemini-3-pro-preview | **Deprecated** |
| Gemini 3 Pro Image | gemini-3-pro-image-preview | **Deprecated** |

### xAI (9 models)
| Model | ID | Status |
|-------|----|--------|
| Grok 4.20 | grok-4.20-0309-non-reasoning | Active (2M context) |
| Grok 4.20 Reasoning | grok-4.20-0309-reasoning | Active |
| Grok 4.1 Fast | grok-4-1-fast-non-reasoning | Active |
| Grok 4.1 Fast Reasoning | grok-4-1-fast-reasoning | Active |
| Grok 3 | grok-3 | Active (legacy) |
| Grok 3 Mini | grok-3-mini | Active (legacy) |
| Grok 3 Fast | grok-3-fast | Active (legacy) |
| Grok 2 | grok-2-1212 | **Deprecated** |
| Grok 2 Vision | grok-2-vision-1212 | **Deprecated** |

### Perplexity (5 models)
| Model | ID | Status |
|-------|----|--------|
| Sonar Pro | sonar-pro | Active (web search) |
| Sonar | sonar | Active |
| Sonar Reasoning Pro | sonar-reasoning-pro | Active |
| Sonar Deep Research | sonar-deep-research | Active |
| Sonar Reasoning | sonar-reasoning | **Deprecated** |

### DeepSeek (2), Mistral (4), Groq (3)
- DeepSeek: deepseek-chat, deepseek-reasoner
- Mistral: mistral-large-latest (256K), mistral-medium-latest, mistral-small-latest, codestral-latest
- Groq: llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768

---

## 6. CORE SYSTEMS — HOW THEY WORK

### 6.1 Token Economy (Cost-Adjusted Billing)

The platform uses a dynamic token billing system:

1. **TOKEN_BASE_RATE** = cheapest package rate ($300/100M = $0.000003) × (1 - 17% margin) = **$0.00000249 per token**
2. When a query costs $X to the provider: `walletTokens = customerPrice / TOKEN_BASE_RATE`
3. Expensive models (Claude Opus at $5/1M input) deduct MORE tokens per query
4. Cheap models (GPT-4o Mini at $0.15/1M) deduct FEWER tokens
5. This ensures profitability on every query regardless of which model or package tier

**Token Packages:**
| Package | Tokens | Price | $/1M |
|---------|--------|-------|------|
| Starter | 500K | $5 | $10 |
| Standard | 2M | $14 | $7 |
| Popular | 5M | $25 | $5 |
| Power | 15M | $60 | $4 |
| Pro | 50M | $175 | $3.50 |
| Enterprise | 100M | $300 | $3 |

### 6.2 AI Gateway Service (`aiGatewayService.ts`)

The central routing service that:
- Routes queries to the correct provider API based on model ID
- Handles both streaming (SSE) and non-streaming responses
- Manages system prompts with **provider personality injection** (each provider's AI sounds like its native platform)
- Implements **smart prompt sizing** — simple queries ("hey?") get lightweight prompts (~50 tokens), complex queries get full prompts (~1,400 tokens)
- Handles web search routing through Perplexity when `webSearchActive=true`
- Supports multimodal messages (images) with per-provider formatting
- Context window trimming — auto-keeps messages within model limits

**Provider-specific handling:**
- **OpenAI:** o-series and GPT-5 use `developer` role, no temperature, `max_completion_tokens`
- **Anthropic:** Extended thinking with `thinking` parameter, beta header, temperature=1 required
- **Google Gemini:** Non-streaming fallback (full response emitted as single chunk)
- **DeepSeek Reasoner:** `reasoning_content` streamed as thinking blocks
- **Perplexity:** Strict user/assistant message alternation, `<think>` tags stripped, citations appended
- **xAI:** No `stream_options` support (causes 400)
- **Mistral:** No `stream_options` support

### 6.3 Deep Think Mode (`thinkingService.ts`)

4-stage expert research pipeline activated when Think button is ON:

**Stage 1 — Query Analysis (hybrid):**
- Fast rule-based pre-screen detects task type, depth level, confidence
- AI classifier (gpt-4o-mini) runs for ambiguous cases
- Model-aware depth adjustment (flagship reasoning models → elevated to research depth)

**Stage 2 — Clarification (if needed):**
- Hypothesis-driven single clarifying question
- Model-aware tone (Claude=warm, o-series=precise, Grok=direct)
- Only asks if answer would be fundamentally different based on missing info

**Stage 3 — Deep Research (Pass 1, non-streaming):**
- Model-aware reasoning styles:
  - Claude: inductive (specific → general)
  - o-series: deductive (premises → conclusions)
  - Gemini: synthetic (gather → pattern → synthesize)
  - Grok: direct (state what you see, challenge conventional wisdom)
  - DeepSeek: explicit reasoning chains
  - Perplexity: source-grounded claims
- Task-specific analysis angles (coding, strategic, analytical, etc.)

**Stage 4 — Refinement (Pass 2, streaming):**
- Self-critique checklist before writing
- Model-aware output formatting
- Builds on research (doesn't summarize it)

**Think Mode Tiers:**
- **Tier A:** Anthropic (native extended thinking with budget_tokens)
- **Tier B:** o-series, Grok reasoning (native reasoning_effort)
- **Tier C:** GPT, DeepSeek, Mistral, etc. (prompt-only thinking)
- **Tier D:** Mini/Nano/Lite models (lightweight thinking)

### 6.4 Provider Personality System (`providerPersonalities.ts`)

Each provider has a deep personality profile injected FIRST in the system prompt:
- **Voice, sentence patterns, formatting instincts**
- **How the model handles uncertainty and disagreement**
- **What it should never do**
- Model-level overrides (30+ specific models) with longest-first fuzzy matching

### 6.5 Voice Conversation System

**Backend:** (`audioService.ts`, `audioController.ts`)
- **STT:** OpenAI Whisper API — $0.006/min + 30% markup
- **TTS:** OpenAI TTS (nova voice) — $15/1M chars + 30% markup
- Token billing via `costAdjustedTokens()` for both

**Frontend:** (`useVoiceConversation.ts`, `VoiceInputButton.tsx`, `VoiceConversationMode.tsx`)
- MediaRecorder with echo cancellation, noise suppression
- AudioContext silence detection (3s threshold → auto-stop)
- Markdown stripping before TTS
- **Continuous voice loop:** speak → auto-transcribe → auto-send → AI responds → auto-speak → auto-listen (600ms delay) → speak again
- Full-screen Voice Conversation overlay with animated orb

### 6.6 Document Processing (`fileController.ts`)

- **PDF:** pdf-parse v2 with `getText({ pageJoiner: '' })` — no phantom page markers
- **DOCX:** mammoth `extractRawText`
- **OCR fallback:** Anthropic Claude Haiku (native PDF document support) or Google Gemini vision
- **Readable-text validation:** checks extracted text has >10% actual words (not PDF commands)
- Truncated to 15,000 chars before sending to AI

### 6.7 Image & Video Generation

- **Image:** DALL-E 3, GPT Image 1, Gemini Flash Image — routed by smart intent detection
- **Video:** Google Veo 2 — with optional "AI director" (thinking pass for prompt refinement)
- Cost-adjusted token billing for all media generation

### 6.8 Web Search

When `webSearchActive=true`:
- If Perplexity API key exists → routes through Sonar Pro transparently
- If not → adds WEB_SEARCH_SYSTEM_BOOST to system prompt
- Citations appended to Perplexity responses

---

## 7. API ENDPOINTS (24 Route Files)

| Route | Path | Purpose |
|-------|------|---------|
| authRoutes | /api/auth | Login, register, Google OAuth, refresh, verify email, reset password |
| aiRoutes | /api/ai | Stream queries, compare models, model recommendation |
| audioRoutes | /api/audio | Voice transcribe (Whisper STT), speak (TTS) |
| modelRoutes | /api/models | List active AI models (public) |
| conversationRoutes | /api/conversations | CRUD conversations, messages, sync, folders |
| memoryRoutes | /api/memory | User memory CRUD |
| fileRoutes | /api/files | File upload, document processing, image/video generation |
| agentRoutes | /api/agents | Custom agent CRUD |
| tokenWalletRoutes | /api/token-wallet | Balance, transactions, allocate tokens |
| tokenRoutes | /api/tokens | Token pool management, allocation |
| stripeRoutes | /api/stripe | Checkout session, verify payment |
| usageRoutes | /api/usage | Dashboard stats, usage history, org usage |
| budgetRoutes | /api/budget | Monthly budget caps, alerts, auto-downgrade |
| sessionRoutes | /api/session | Hourly session management |
| teamRoutes | /api/team | Invite, remove, manage team members |
| orgRoutes | /api/org | Organization settings, analytics |
| activityRoutes | /api/activity | Activity log for orgs |
| taskRoutes | /api/tasks | Task management (create, assign, subtasks) |
| notificationRoutes | /api/notifications | In-app notifications |
| adminRoutes | /api/admin | Platform admin dashboard, user management |
| apiKeyRoutes | /api/keys | API key CRUD |
| reviewRoutes | /api/reviews | Platform reviews |
| openWebUIRoutes | /api/ai/openwebui | OpenWebUI-compatible API |
| walletRoutes | /api/wallet | **ORPHANED — not mounted in server.ts** |

---

## 8. FRONTEND PAGES

### Desktop (29 pages)
- **ChatPage** — Main chat interface with model selector, agents, Think mode, voice, canvas
- **DashboardPage** — Role-based views (Admin, Owner, Manager, Employee, Personal)
- **TokenStorePage** — Purchase token packages via Stripe
- **UsagePage** — Usage analytics with charts
- **ModelsPage** — Browse available AI models
- **SettingsPage** — User profile, password, preferences
- **TeamPage** — Team member management, invites
- **TasksPage** — Task board with subtasks, comments
- **OrgPage** — Organization settings
- **BudgetsPage** — Budget cap management
- **SessionsPage** — Hourly session management
- **ApiKeysPage** — API key management
- **ApiDocsPage** — API documentation
- **Admin pages** (8) — Users, orgs, models, revenue, analytics, send tokens

### Mobile (7 pages)
- MobileChatPage, MobileHomePage, MobileWalletPage, MobileSettingsPage, MobileAgentsPage, MobileLoginPage, MobileRegisterPage

### Public (7 pages)
- LandingPage, LoginPage, RegisterPage, VerifyEmailPage, ResetPasswordPage, PrivacyPolicyPage, TermsOfServicePage

---

## 9. WHAT IS WORKING (Completed Features)

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-provider AI routing | WORKING | 8 providers, 40+ models |
| Streaming responses (SSE) | WORKING | All providers except Gemini (non-streaming fallback) |
| Token wallet billing | WORKING | Purchase, deduction, transaction history |
| Stripe payments | WORKING | Checkout, webhooks, payment verification |
| Cost-adjusted token billing | WORKING | Dynamic TOKEN_BASE_RATE with 17% margin |
| User authentication | WORKING | JWT + Google OAuth |
| Team management | WORKING | Invite, roles, token allocation |
| Think Mode (deep reasoning) | WORKING | 4-stage pipeline, model-aware |
| Voice conversation | WORKING | STT + TTS with continuous loop |
| Image generation | WORKING | DALL-E 3, GPT Image 1, Gemini Flash |
| Video generation | WORKING | Google Veo 2 |
| Document upload/analysis | WORKING | PDF, DOCX with OCR fallback |
| Web search | WORKING | Perplexity backend routing |
| Custom agents | WORKING | 8 default + custom creation |
| User memory | WORKING | Persistent across conversations |
| Provider personalities | WORKING | Deep voice/style per provider |
| Smart prompt sizing | WORKING | 83% token savings on simple queries |
| Usage analytics | WORKING | Per-user, per-model tracking |
| Admin dashboard | WORKING | User management, revenue, analytics |
| OpenWebUI compatibility | WORKING | Drop-in API replacement |
| Dark/Light theme | WORKING | CSS variable-based theming |
| Mobile app shell | WORKING | Capacitor with deep links |
| Conversation management | WORKING | Create, rename, pin, folders, sync |
| Notifications | WORKING | In-app notification system |
| Activity logging | WORKING | Org-level audit trail |

---

## 10. KNOWN BUGS & ISSUES

### Critical
| # | Issue | Location |
|---|-------|----------|
| 1 | **walletRoutes not mounted** — entire wallet API unreachable | server.ts (missing `app.use`) |
| 2 | **Google OAuth error redirects to localhost** | authController.ts:334,343 |
| 3 | **Budget.currentUsage never incremented** — budget caps non-functional | Missing increment in AI controller |
| 4 | **orgTokenBalance never decremented on usage** | tokenWalletService.ts |

### High
| # | Issue | Location |
|---|-------|----------|
| 5 | **Mistral/Groq models hidden** from frontend (`HIDDEN_PROVIDERS`) | useModels.ts:15 |
| 6 | **Perplexity/xAI tabs missing** from ModelsPage | ModelsPage.tsx:18-26 |
| 7 | **Landing page references deprecated Grok 2** | LandingPage.tsx:25 |
| 8 | **Task/subtask operations have NO authorization** | taskController.ts:396-457 |
| 9 | **API keys stored in plaintext** | schema.prisma:108 |
| 10 | **Math.random() for verification codes** (not crypto-secure) | authService.ts:266 |
| 11 | **platform_admin role self-assignment via invite** | authController.ts:20-26 |
| 12 | **Token allocation revocation leaks tokens** | tokenController.ts:382-394 |
| 13 | **compareModels creates double usage logs** | aiController.ts:1225-1244 |
| 14 | **sanitizeObject doesn't handle arrays inside objects** | security.ts:68-96 |
| 15 | **No rate limiting on auth routes at app level** | authRoutes.ts |
| 16 | **ngrok CORS origins allowed in production** | server.ts:100 |
| 17 | **Gemini streaming is faked** (full response as one chunk) | aiGatewayService.ts:1533-1543 |

### Medium
| # | Issue | Location |
|---|-------|----------|
| 18 | CORS origin mismatch between frontendUrl and corsOrigin defaults | env.ts:65,76 |
| 19 | Multiple hardcoded localhost fallbacks in frontend/backend | Various files |
| 20 | Frontend: CommonJS require('react') in AuthCallbackPage | App.tsx:112 |
| 21 | Frontend: toast called during render in RoleGuard/SessionGuard | App.tsx:82-108 |
| 22 | Frontend: 429 retry logic only retries once | api.ts:45-46 |
| 23 | Frontend: sendWithContext missing AbortController | ChatContext.tsx:469 |
| 24 | MobileSettingsPage logout bypasses AuthContext | MobileSettingsPage.tsx:83-85 |
| 25 | Voice errors only logged to console (no user feedback) | Various voice files |
| 26 | Document download errors not shown to user | DocumentDownloadBar.tsx |
| 27 | 16+ FK relations missing onDelete cascade rules | schema.prisma |
| 28 | Missing @@unique on AIModel.modelId | schema.prisma:128 |
| 29 | N+1 queries in admin stats and token pool breakdown | adminController, tokenController |
| 30 | getOrgUsage loads ALL logs into memory (no pagination) | usageController.ts:203 |

---

## 11. WHAT IS REMAINING / NOT DONE

### Phase 1 Priorities (Current Sprint)
| Item | Status | Priority |
|------|--------|----------|
| Mount walletRoutes in server.ts | NOT DONE | Critical |
| Fix Google OAuth localhost redirects | NOT DONE | Critical |
| Fix budget currentUsage increment | NOT DONE | Critical |
| Add Perplexity/xAI tabs to ModelsPage | NOT DONE | High |
| Unhide Mistral/Groq in frontend | NOT DONE | High |
| Update landing page model list (remove Grok 2, add Grok 4) | NOT DONE | High |
| Add authorization to task/subtask operations | NOT DONE | High |
| Hash API keys before DB storage | NOT DONE | High |
| Fix platform_admin role escalation via invite | NOT DONE | High |

### Phase 2 (Planned)
| Item | Status |
|------|--------|
| Redis caching layer | NOT STARTED |
| Real Gemini streaming (not faked) | NOT STARTED |
| iOS app build and testing (requires Mac + Xcode) | NOT STARTED |
| Android Play Store submission | BLOCKED (needs screenshots, privacy policy) |
| Stripe live key (currently test key `pk_test_`) | NOT DONE |
| Email alerts for budget caps | Partially configured |
| Rate limiting on auth routes | NOT DONE |
| Webhook retry handling | NOT DONE |

### Phase 3 (Future)
| Item | Status |
|------|--------|
| Multi-language support | NOT STARTED |
| Custom model fine-tuning | NOT STARTED |
| Marketplace for agents | NOT STARTED |
| Enterprise SSO (SAML/OIDC) | NOT STARTED |
| Audit log export | NOT STARTED |
| Usage forecasting/alerts | NOT STARTED |

---

## 12. ENVIRONMENT VARIABLES REQUIRED

```
# Server
PORT=5000
NODE_ENV=production

# JWT
JWT_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>

# Database
DATABASE_URL=postgresql://user:pass@host:5432/convoia

# AI Provider API Keys (8 providers)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AI...
DEEPSEEK_API_KEY=sk-...
MISTRAL_API_KEY=...
PERPLEXITY_API_KEY=pplx-...
XAI_API_KEY=xai-...
GROQ_API_KEY=gsk_...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Stripe
STRIPE_SECRET_KEY=sk_live_... (currently sk_test_)
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
RESEND_API_KEY=re_...

# Frontend
FRONTEND_URL=https://intellect.convoia.com
CORS_ORIGIN=https://intellect.convoia.com
```

---

## 13. DEPLOYMENT COMMANDS

```bash
# Pull latest code
cd ~/convoia && git pull

# Backend: build + restart
cd backend && rm -rf dist && npm run build && npx prisma db seed && pm2 restart all

# Frontend: build
cd ../convoia_frontend && npm run build

# Check logs
pm2 logs convoia-api --lines 50 --nostream
```

---

## 14. KEY ARCHITECTURAL DECISIONS

1. **Token-based billing over subscriptions** — More flexible for B2B, no recurring charge anxiety
2. **Direct API calls over SDK wrappers** — Full control over request/response handling per provider
3. **Provider personality injection** — Makes each model feel native to its platform
4. **Hybrid think mode (rule-based + AI)** — Saves cost on obvious queries, uses AI for ambiguous ones
5. **localStorage for conversation cache** — Reduces DB reads, synced to backend periodically
6. **Capacitor for mobile** — Single codebase for web + Android + iOS
7. **SSE streaming** — Server-Sent Events for real-time AI response streaming
8. **Cost-adjusted tokens** — Single wallet works across models of vastly different prices

---

*This document was auto-generated from codebase analysis on April 10, 2026.*
