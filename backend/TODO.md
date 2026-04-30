# Convoia AI — Technical Debt Tracker

## Priority 1 — Real industry agents (pre-launch)
- [ ] Legal AI: 500-line system prompt, proper model selection, case-law tools
- [ ] Healthcare AI: evidence-based prompt, disclaimer handling, patient-friendly language
- [ ] Finance AI: advisory boundaries, compliance awareness
- Context: Audit found these are one-liner prompt modifiers, not real agents
- Impact: Marketing credibility risk — can't claim "Healthcare AI" if it's just "be evidence-based"

## Priority 2 — Apex enhancements (nice to have)
- [ ] Make Haiku moderator configurable (set via Agent table)
- [ ] Accuracy score UI (model agreement %)
- [ ] Per-model reasoning expandable in UI
- [ ] Disagreement flags when models contradict

## Priority 3 — Defer until user signal (post-launch)
- [ ] pgvector migration for vectorMemoryService (only when power users have 500+ memories)
- [ ] Tool framework expansion: image-gen + file-gen as callable tools
- [ ] Logging cleanup in aiGatewayService.ts (base64 token inflation)

## Future improvement — per-AIModel default budgets

Store `defaultMaxReasoningTokens` + `defaultMaxSearchQueries` per AIModel row instead of the hardcoded heuristic in `tokenWalletService.estimateQueryCost` (250k reasoning + 50 queries when prices > 0).

Tunable per-model without code changes. Refs: Fix 6 Phase A.5 (commit will be added).


## BUG-009 — Agent tool web search unbilled (LATENT)

**Status:** Code path exists, zero production traffic to date
**Total leaked:** $0.00 (verified: 0 rows in toolExecution where toolName='web_search')

**Location:**
- `agentTools.ts:webSearch()` — direct Perplexity call, no billing
- Called from `executeTool()` in agentOrchestrator.ts:209, :398
- Distinct from `webSearchService.searchWeb()` (which IS billed via commits 4fa23ac + 1309846)

**Recommended fix (Option B from investigation):**
1. Extend `agentTools.webSearch()` signature to accept userId/organizationId
2. Capture `response.data.usage` from Perplexity, return on ToolResult
3. After `executeTool` returns in agentOrchestrator.ts:209/398, run billing block
   (pattern: copy aiController.ts:1437 — lookup sonar model, compute cost, write UsageLog, deduct wallet)

**Effort:** ~25 lines across 2 files
**Priority:** Activate only if agent tool-call traffic begins firing
**Identified:** 2026-04-27 audit. Investigation 2026-04-27 confirmed zero traffic.

## BUG-013 — Circular JSON error at aiController.ts:1114
Status: Latent bug, separate from Hotfix-L scope
Symptom: onError callback's JSON.stringify(err) fails when err contains TLSSocket
Impact: Error logs occasionally show 'Converting circular structure to JSON' instead of useful info
Fix approach: Use a JSON.stringify replacer that strips TLSSocket / circular refs before serialization
Effort: ~10 lines in onError handler
Priority: Low (cosmetic — error still surfaces, just with this extra noise line)
Identified: 2026-04-29 during Hotfix-L investigation

## BUG-014 — Streaming dispatch lacks TEMP_LOCKED_MODELS self-populate
Status: Latent gap — only fires for new OpenAI models that hit streaming
first AND have temperature lockdown AND aren't pre-seeded
Symptom: 400 with no recovery (vs non-streaming which auto-retries via
safeProviderCall and adds model to cache)
Fix approach: Extract safeProviderCall's catch-and-retry pattern into a
shared utility, apply to both callOpenAI and callOpenAIStream
Effort: ~30 lines, careful refactor
Priority: Low — workaround is pre-seeding probed models
Identified: 2026-04-29 during HOTFIX-GPT55-T investigation

## Tier 1 LoginPage hybrid redesign — DONE 2026-04-30

Resolved via prod commit c7a1b64 (cherry-pick of local 75a5327).
Final state: AuthLayout single-column visual shell + rememberMe checkbox
inline with Forgot password link + 3-arg login(email, password, rememberMe)
call + AuthContext extended with optional rememberMe param.
data-theme wrapper already absent in the deployed LoginPage.

Files touched: LoginPage.tsx, AuthContext.tsx (rememberMe was already
present on prod via cbba0a9; LoginPage replaced from prod-old layout).
