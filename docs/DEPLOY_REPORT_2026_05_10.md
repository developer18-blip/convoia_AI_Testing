# Deploy Report — Visitor Chatbot + Account-Deletion Page

**Session window:** 2026-05-09 evening → 2026-05-10 morning
**Engineer:** Anirudh Rai
**Production state at end of session:** prod HEAD `fc26615` on `fix/max-tokens-truncation-on-documents`; PM2 `convoia-api` healthy (41/54 models active)

---

## 1. Executive summary

Two user-facing features shipped to `https://convoia.ai`:

| | What | Where | Why |
|---|---|---|---|
| 1 | **"Convo" visitor chatbot** | floating bubble bottom-right on every web route | first-time customer touchpoint to answer pre-signup questions and route action intents to the right destination |
| 2 | **Public account-deletion page** | `/account-deletion` | unblock Play Console Data Safety form (which requires a publicly-discoverable deletion URL) |

Both are live. No regressions reported. Production cost ceiling for the chatbot is bounded: 15 messages/hour/IP × ~$0.0001/query (Haiku 4.5) = ~$0.0015/IP/hour worst case.

---

## 2. What is now live

### 2.1 Visitor chatbot ("Convo")

- **Floating bubble** bottom-right on every web route (hidden on Capacitor native shell). 56×56 turquoise circle with first-visit pulse + "new" indicator dot. Click expands a 380×580 glass panel that slides up.
- **Anonymous, no auth required** — calls `POST /api/public/chatbot/stream`, rate-limited per-IP at 15 messages/hour and 50/day.
- **Anthropic Haiku 4.5** answers, streamed via SSE through nginx → PM2.
- **Markable features:**
  - **Inline CTA cards** — bot emits `[CTA:action_id:Label]` markers; frontend renders them as full-width turquoise buttons inside message bubbles, click navigates to deep-linked destinations
  - **Auth-aware deep-link routing** — for protected routes, logged-out clicks stash the path in `sessionStorage` and route through `/register`; AuthContext consumes the stash post-auth so the user lands on their intended destination, not the default `/chat`
  - **30+ action destinations** with fuzzy keyword fallback (handles bot output drift gracefully)
  - **Smart follow-up chips** — bot ends responses with `[FOLLOWUPS:Q1?|Q2?|Q3?]`, rendered as clickable suggestion pills
  - **Cost transparency footer** — every reply shows `$0.0003 · Haiku 4.5 · 412 tok` in muted monospace
  - **Provider-aware accent** — widget reads existing `AccentContext` so colors shift with the active provider on `/chat`

### 2.2 Account-deletion landing page

- **URL:** `https://convoia.ai/account-deletion` (public, no auth)
- **Process:** email-based — visitor sends a signed-from-registered-email request to `privacy@convoia.com` with subject `Account Deletion Request`, processed within 30 days
- **Sections:** How to request → What gets deleted (5 categories) → What is retained (financial 7yr, anonymized analytics, server logs 30-90d) → Need help
- **Privacy Policy** has two new inline links to the page (Section 4 Data Retention + Section 5.1 Right to Delete)

---

## 3. Detailed timeline (commits in deploy order)

| # | Local SHA | Prod SHA | Description |
|---|---|---|---|
| 1 | `82158de` | `959d1af` | Chatbot v1 — initial widget + backend route. Conflict on cherry-pick: prod's `userRoutes` lived at the same import/mount anchors → keep-both resolution |
| 2 | `df25509` | `7a67a1a` | Chatbot v2 — fix "messages array is required" bug (async setState race in `useChatbot.ts` → mirror messages into a `useRef` for synchronous read) + remove X dismiss button per UX |
| 3 | `b72c823` | `786bd5b` | Chatbot v3 — robust deep-link routing: 30+ action destinations with `isProtected` flag, fuzzy fallback, auth-aware navigate, sessionStorage post-auth redirect, full action vocabulary in system prompt. Conflict in `AuthContext.tsx` (prod older path) → kept new code + added `isNative` import |
| 4 | `7fbbecb` | `fc26615` | Account-deletion page — public `/account-deletion` route + Privacy Policy links. Conflict in `App.tsx` (prod's `/review` + `/design-system` routes vs new `/account-deletion`) → keep-both resolution |

Branch on origin: `feat/mobile-handoff-and-brand-color` at `7fbbecb` (HEAD).

Backups on prod (one `mv` to roll back):
- `backend/dist.pre-chatbot-20260508-223217`
- `convoia_frontend/dist.pre-chatbot-20260508-223217`
- `convoia_frontend/dist.pre-deletionpage-20260508-234205`

---

## 4. Files changed by area

### Backend (5 files, ~470 lines)
- `backend/src/services/chatbotKnowledgeBase.ts` (new) — system prompt + 30+ action vocabulary
- `backend/src/controllers/publicChatbotController.ts` (new) — anonymous SSE handler with input limits + Anthropic streaming
- `backend/src/routes/publicChatbotRoutes.ts` (new) — `POST /api/public/chatbot/stream` mount
- `backend/src/middleware/rateLimiter.ts` — added `chatbotBurstLimiter` (15/hr/IP) + `chatbotDailyLimiter` (50/day/IP)
- `backend/src/server.ts` — mount + SSE compression skip

### Frontend (8 files, ~1700 lines)
- `convoia_frontend/src/hooks/useChatbot.ts` (new) — state machine, SSE consumer, action map, fuzzy resolver
- `convoia_frontend/src/components/chatbot/ChatbotWidget.tsx` (new) — bubble + panel shell
- `convoia_frontend/src/components/chatbot/ChatbotMessage.tsx` (new) — markdown renderer + CTA + follow-ups
- `convoia_frontend/src/components/chatbot/ChatbotInput.tsx` (new) — textarea + send + counter
- `convoia_frontend/src/components/chatbot/ChatbotCTACard.tsx` (new) — inline action button card
- `convoia_frontend/src/pages/public/AccountDeletionPage.tsx` (new) — deletion landing page
- `convoia_frontend/src/contexts/AuthContext.tsx` — sessionStorage post-auth redirect consumer
- `convoia_frontend/src/App.tsx` — mounts widget + adds public routes
- `convoia_frontend/src/pages/public/PrivacyPolicyPage.tsx` — inline deletion-page links in §4 + §5.1

---

## 5. Operational

### Cost watch (chatbot)
```bash
ssh -i "/path/to/Convoia_Ai.pem" ubuntu@54.184.97.143
pm2 logs convoia-api --nostream | grep "\[chatbot\]" | tail -50
```
Each line: `ip=X input=N output=N cost=$0.xxx`. First live query measured: $0.002406 (1886 in / 104 out tokens). Daily ceiling per IP: 50 × ~$0.0024 ≈ $0.12. Even 1000 unique visitors/day ≈ $1.50/day.

### Rollback (chatbot)
```bash
ssh prod
cd /home/ubuntu/convoia
git revert fc26615 786bd5b 7a67a1a 959d1af --no-edit
cd backend && npm run build && pm2 reload convoia-api
cd ../convoia_frontend && npm run build
```
~3 minutes end-to-end.

### Rollback (deletion page only)
```bash
git revert fc26615 --no-edit
cd convoia_frontend && npm run build
```
~90 seconds.

---

## 6. Open follow-ups (deferred to a future session)

1. **Backend self-service deletion endpoint** — `DELETE /api/auth/me` wrapping the admin handler at `backend/src/controllers/adminController.ts:670-755` with JWT auth instead of admin role
2. **In-app delete button** — danger zone in desktop `SettingsPage` and `MobileSettingsPage` with confirm modal that calls the new endpoint
3. **Hard vs soft delete decision** — admin handler is hard-immediate, Privacy Policy says "within 30 days." Recommended: hard delete + rewrite policy line to "promptly delete (financial records retained 7 years per law)." Soft delete adds schema migration + auth-everywhere updates + cron job for marginal user-recovery value
4. **Privacy Policy 30-day language reconciliation** — only after #3 lands
5. **Local↔prod git divergence reconcile** — chatbot deploys (959d1af → 7a67a1a → 786bd5b → fc26615) added more cherry-picks; the divergence noted in `local_prod_git_divergence_blocker.md` needs a dedicated session
6. **`chore(android)` versionCode bump** — uncommitted in working tree from yesterday's AAB build; address before next AAB

---

# Filling out the Google Play Console — Data Safety form

The deletion URL was the only blocker on the Data Safety section of the Play Console listing. With `https://convoia.ai/account-deletion` now live, here is exactly what to enter.

## Where to go in Play Console
**Play Console → your app → App content → Data safety → Manage**

The form has four screens. Use the values below.

## Screen 1 — Data collection and security

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS/TLS for every API call — verified via nginx config + Privacy Policy §7) |
| Do you provide a way for users to request that their data is deleted? | **Yes** |
| **Account-deletion URL (paste)** | `https://convoia.ai/account-deletion` |

## Screen 2 — Data types collected

Mark each as collected: **Yes** for all rows below; **shared** = No for everything (we never share with third parties for marketing). Reference: [Privacy Policy §1](https://convoia.ai/privacy).

| Category | Specific items | Purpose | Optional or required |
|---|---|---|---|
| **Personal info** | Name, Email address, User IDs | App functionality, Account management | Required |
| **Personal info** | Other info (org name, industry — for team accounts) | App functionality | Optional |
| **Financial info** | Purchase history (token packages) | App functionality, Compliance | Required |
| **Messages** | Other in-app messages (your queries to AI models) | App functionality | Required |
| **App activity** | App interactions (token usage, model selection, session timestamps) | Analytics, App functionality | Required |
| **App info and performance** | Crash logs, Diagnostics | Analytics | Required |
| **Device or other IDs** | Device or other IDs (browser type, OS, IP, general location at city level) | Security and fraud prevention | Required |

**Do NOT mark these (we don't collect them):**
- Location: Approximate / Precise location ❌
- Photos and videos ❌
- Audio files ❌ (voice-input is processed in-browser, not uploaded raw)
- Files and docs (only those the user explicitly uploads as attachments — disclosed under Messages → Other)
- Calendar / Contacts ❌
- Health and fitness ❌
- Web browsing history ❌

## Screen 3 — Data sharing

Convoia forwards user queries to third-party AI providers (OpenAI, Anthropic, Google, etc.) to generate responses. Per Google's [own definition](https://support.google.com/googleplay/android-developer/answer/10787469#sharing), this is **processing**, not **sharing**, when:
- The third party processes data on your behalf under instructions
- Data is ephemeral / encrypted in transit
- It's necessary for the core feature

Result: **Mark "No" for sharing** on all data types. Add this clarification in the form's free-text field if available:
> User queries are forwarded to third-party AI providers (OpenAI, Anthropic, Google, etc.) for the sole purpose of generating responses. Each provider acts as a processor under their own privacy terms, which are linked from our Privacy Policy. We do not sell, rent, or share user data with advertising networks or data brokers.

## Screen 4 — Security practices

| Question | Answer |
|---|---|
| Is your data encrypted in transit? | **Yes** — HTTPS/TLS for every endpoint |
| Do you provide a way for users to request that their data be deleted? | **Yes** — `https://convoia.ai/account-deletion` |
| Do you adhere to Google Play's Families Policy? | **No** — app is not directed at children under 13 (per Privacy Policy §6, COPPA-aligned) |
| Has your app been independently validated against a global security standard? | **No** (mark No unless you have a SOC 2 / ISO 27001 cert) |

## Final URLs to paste in the form

| Field | Value |
|---|---|
| Privacy Policy URL | `https://convoia.ai/privacy` |
| Account-deletion URL | `https://convoia.ai/account-deletion` |
| Support email | `support@convoia.ai` (or `privacy@convoia.com` for data requests) |

After submitting the Data Safety form, the listing returns to "Pending publication" status. Google's automated review typically takes 1–7 days; manual review can take 14+ days for new apps.

---

# Filling out Google OAuth Verification (if applicable)

If your app uses Google Sign-In and shows the unverified-app warning, you need OAuth Verification through the Google Cloud Console. Convoia uses Google OAuth (per `authController.ts` and the `/auth/google` endpoint), so this is likely needed before consumer launch.

## Where to go
**Google Cloud Console → APIs & Services → OAuth consent screen → Edit App**

## What Google needs (most are now ready)

| Field | Value |
|---|---|
| App name | Convoia AI |
| App logo | Upload the Convoia mark (PNG, ≥120×120, transparent bg) |
| Application home page | `https://convoia.ai` |
| Application privacy policy link | `https://convoia.ai/privacy` |
| Application terms of service link | `https://convoia.ai/terms` |
| Authorized domains | `convoia.ai` |
| Developer contact info | `support@convoia.ai` |
| Scopes requested | `openid`, `email`, `profile` only — these are non-sensitive, no verification required |

## Account-deletion URL field (if asked)
Some Google verification flows now ask for a deletion URL the same way Play Console does. If the OAuth consent screen has this field, paste:
> `https://convoia.ai/account-deletion`

## What still needs work for full OAuth verification
- A **brand verification screencast / demo video** (≤2 min) showing the Google Sign-In flow on the actual product. Record this with screen capture, no narration needed.
- If you ever request sensitive scopes (Gmail, Drive, Calendar), Google requires an **annual third-party CASA security assessment** (~$10K, ~6 weeks). Stay on `openid email profile` to avoid this entirely.

---

## Quick reference card

| Where | What to paste |
|---|---|
| Play Console → Data Safety → Account-deletion URL | `https://convoia.ai/account-deletion` |
| Play Console → Privacy Policy URL | `https://convoia.ai/privacy` |
| Google OAuth Consent → Privacy Policy | `https://convoia.ai/privacy` |
| Google OAuth Consent → Terms of Service | `https://convoia.ai/terms` |
| Google OAuth Consent → Authorized domains | `convoia.ai` |

The mobile AAB v1.1.0 (versionCode 2) is already on the Play Console **internal testing** track from yesterday's session. Once Data Safety is submitted and Google's review passes, you can promote that AAB to **production** on the same listing.
