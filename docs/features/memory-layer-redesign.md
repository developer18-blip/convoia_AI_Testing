# Memory Layer Redesign — Architecture & Build Plan

**Status:** Phase 1 audit complete; Phase 2 architecture locked. Day 2 (schema migration) starts after this commit.
**Author:** Anirudh Rai
**Date:** 2026-04-29
**Driver:** Production memory poisoning (4 conflicting name claims for user `3ae2fd19`) reaching the LLM. Surgical filter shipped today (`b7ef03e`) hides the symptom; this redesign cures it.

---

## Phase 1 — Audit (read-only)

### Architecture today

Four memory files exist. Only two are in the live path.

| File | Lines | Status |
|---|---|---|
| `backend/src/services/vectorMemoryService.ts` | 507 | Primary — regex extraction → embedding → store; semantic retrieval |
| `backend/src/services/userMemoryService.ts` | 201 | Fallback — only `getUserMemoryPrompt` is called when vector path errors |
| `backend/src/services/agentMemoryService.ts` | 280 | Per-agent memory — 0 rows in production (never used) |
| `backend/src/routes/memoryRoutes.ts` | 30 | API endpoints exist, registered at `server.ts:266`, **frontend never calls them** |

### Storage flow

1. After every assistant reply, `extractMemoriesFromMessage` runs against user message
2. 14 regex `EXTRACTION_PATTERNS` look for "my name is X", "I work at Y", goals, preferences
3. Anti-patterns reject questions and code blocks
4. New row created with key `${category}_${simpleHash(value)}` — content-hash key creates collision per typo variant (Annieyyy, Annieyyyy, Anirudh all get separate rows)
5. Embedding generated via `text-embedding-3-small` @ 256 dimensions, stored in JSON inside `source` field
6. **Only quality gate is exact text match dedup**

### Retrieval flow

1. `processMemoryForQuery(userId, lastMessage, maxChars)` called from `aiController.ts:925`
2. 30-second in-memory cache keyed by `userId:query[:100]`
3. Pulls top 100 user memories, computes cosine similarity in-process
4. Score = `0.5 * cosine + 0.3 * importance + 0.2 * timeDecay(30d half-life)`
5. Returns top 5 above threshold 0.15
6. **Today's filter (`b7ef03e`)** runs at this point: contradiction detection, fragment drop, dedup
7. Format as `[User context: A; B; C]` and append to system prompt

### Database schema (UserMemory)

```prisma
model UserMemory {
  id        String   @id @default(uuid())
  userId    String
  category  String   // identity | preference | fact | goal | project | context | instruction
  key       String   // "identity_v85df1" — content hash, not logical key
  value     String   // the fact string
  source    String?  // JSON: {embedding: [256 floats], importance}
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([userId, key])
  @@index([userId])
}
```

`source` field is overloaded for both provenance and embedding. Key uses content hash, so typos create separate rows instead of overwriting.

### Production data (snapshot)

- **171 total memories** across **17 users** (much smaller than expected)
- All stored with embeddings (no NULL source rows)
- AgentMemory: **0 rows** — feature unused
- Category distribution: goal=66, preference=49, fact=34, identity=14, project=8

### Quality findings

Syntactic issues (small):
- 14.7% truncated quotes
- 6.5% missing terminal punctuation
- 4.9% under 20 chars
- 0% code-like

**The bigger defect is semantic:** regex extraction can't distinguish persistent facts from transient task descriptions.

Examples from production:
- Legal user `68a679d4`: "Goal: respond professionally to opposing counsel" — was a one-time email request, not a persistent goal
- SEO user `58259b3e`: 31 of 51 memories are individual blog topic requests stored as "Goals"
- Anirudh user `3ae2fd19`: 4 conflicting name claims accumulated because per-row hash key prevents proper supersession

### Frontend

Zero user-facing memory UX. `/api/memory` endpoints exist but no React component calls them. Users cannot view, edit, or delete what's stored about them.

### Cost reality

- Current embedding spend: ~$0.10/month (negligible)
- Migration cost (171 rows reformulated): ~$0.02 one-time
- Projected new extraction cost: ~$15/month at current usage

**Scale is small — design freely for quality, not constrained by cost.**

### Phase 1 conclusions

1. Scale is small (171 rows) — migration is trivial
2. Cost is negligible — design freely
3. The defect is semantic, not syntactic — regex can't tell "I want a blog post about X" from "I am someone who writes about X"
4. Frontend has zero memory UX — green field
5. Today's filter (`b7ef03e`) is hiding symptoms, not curing them — bad data still accumulates daily; users can't clean it up

---

## Phase 2 — Architecture (locked)

### Locked decisions

| Decision | Choice |
|---|---|
| Existing memories | Migrate via LLM reformulation (preserve user trust) |
| Schema | Unified UserFact table with `source` field |
| Extraction trigger | Hourly background job per active user |
| Categorization | Mirror Claude.ai: WORK / PERSONAL / TOP_OF_MIND / HISTORY |
| Filter (`b7ef03e`) | Stays in place during transition; retire after retrieval cutover |

### 2a. Schema

```prisma
model UserFact {
  id              String   @id @default(uuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  category        FactCategory   // WORK | PERSONAL | TOP_OF_MIND | HISTORY
  content         String         // natural-language fact

  source          FactSource     // EXTRACTED | USER_ADDED | MIGRATED
  confidence      Float          // 0.0-1.0; user-added defaults to 1.0

  sourceConvoId   String?        // conversation that produced this fact
  sourceMessageId String?

  active          Boolean  @default(true)
  supersededBy    String?        // points to UserFact.id replacing this
  expiresAt       DateTime?      // TOP_OF_MIND default 14 days

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lastUsedAt      DateTime?      // updated when fact was injected into a prompt

  @@index([userId, category, active])
  @@index([userId, supersededBy])
  @@index([userId, lastUsedAt])
}

enum FactCategory {
  WORK         // role, projects, collaborators, tech stack
  PERSONAL     // location, communication style, preferences, language
  TOP_OF_MIND  // current focus, active problem (auto-decay 14d)
  HISTORY      // past projects, previous roles
}

enum FactSource {
  EXTRACTED    // LLM-extracted from conversation
  USER_ADDED   // typed manually in settings UI
  MIGRATED     // reformulated from old UserMemory rows
}

model UserConversationSummary {
  id             String   @id @default(uuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  conversationId String   @unique

  summary        String
  factIds        String[]
  messageCount   Int
  processedAt    DateTime @default(now())

  @@index([userId, processedAt])
}
```

Old `UserMemory` table renamed to `UserMemoryArchive` after migration. Kept 30 days for rollback, then dropped.

**Schema rationale:**
- Enum prevents category drift ("WORK" vs "Work" vs "work")
- `supersededBy` enables soft-history audit trail when user identity claims change
- `expiresAt` on TOP_OF_MIND only — current focus naturally decays
- `lastUsedAt` powers freshness signals in the user-facing UI
- `ConversationSummary` separate from facts because they have different lifecycles (immutable vs evolving)

### 2b. Fact extraction pipeline

**Trigger:** hourly background job (`node-cron`, same process, behind `MEMORY_EXTRACTION_ENABLED` flag).

**Eligibility:** conversation has 2+ user messages, no message in 30 min, not yet processed.

**Model:** Claude Haiku 4.5 — `claude-haiku-4-5-20251001` (cheap, fast).

**System prompt (the IP of this redesign):**

```
You are a memory extractor for a chat assistant. Your job is to read a
conversation and identify PERSISTENT facts about the user — things that
will still be true a month from now.

CRITICAL DISTINCTION:
- PERSISTENT FACT: "User builds AI platforms" / "User prefers TypeScript" /
  "User is based in Seattle"
- TRANSIENT TASK: "User wants a blog post about tummy tucks" /
  "User is debugging an OOM error" / "User asked about TCP"

Transient tasks must NOT be extracted as facts.

Output strict JSON:
{
  "facts": [
    {
      "category": "WORK" | "PERSONAL" | "TOP_OF_MIND" | "HISTORY",
      "content": "Clean natural-language fact",
      "confidence": 0.0-1.0,
      "supersedes_existing": "fact id from input, if this replaces one"
    }
  ],
  "summary": "2-3 sentence summary of conversation"
}

Confidence guide:
- 0.9+: User stated directly ("My name is X")
- 0.7-0.9: Strongly implied by repeated context
- 0.5-0.7: Inferred from one mention
- <0.5: Don't include
```

**Cost:** ~$0.006 per extraction; ~17 users × 5 conv/day × 30 days = ~$15/month.

**Error handling:** mark conversation processed in either case; log on parse failure; drop facts >200 chars or containing code.

### 2c. Retrieval logic

Replaces vector cosine with query-type-aware fact selection.

```typescript
const memoryStrategy = (intent: ClassifiedIntent): MemoryStrategy => {
  switch (intent.category) {
    case 'coding':            return { categories: ['WORK', 'TOP_OF_MIND'], maxFacts: 8 };
    case 'analysis':
    case 'planning':          return { categories: ['WORK', 'TOP_OF_MIND', 'HISTORY'], maxFacts: 10 };
    case 'personal':
    case 'advice':            return { categories: ['PERSONAL', 'WORK', 'TOP_OF_MIND'], maxFacts: 8 };
    case 'creative':
    case 'long_form_writing': return { categories: ['PERSONAL', 'WORK'], maxFacts: 6 };
    case 'simple':
    case 'greeting':          return { categories: ['PERSONAL'], maxFacts: 3 };
    default:                  return { categories: ['WORK', 'PERSONAL', 'TOP_OF_MIND'], maxFacts: 8 };
  }
};
```

Algorithm:
1. Pull active facts in eligible categories (not expired, not superseded)
2. Order by confidence DESC, lastUsedAt DESC
3. Take top N
4. Update `lastUsedAt` async (don't block)

**New prompt format** replaces `[User context: A; B; C]`:

```
## About this user

**Work:** Runs RealDrSeattle. Building Convoia AI multi-LLM platform on Node.js + AWS ECS. Uses TypeScript and Laravel.

**Personal:** Based in Seattle/Kirkland WA. Prefers minimal targeted code changes over wholesale rewrites.

**Currently focused on:** Memory layer redesign. Just shipped GPT-5.5 integration.
```

Natural, scannable, structured — like Claude.ai.

### 2d. Migration strategy

One-time script reformulating 171 legacy `UserMemory` rows into `UserFact` rows.

**Reformulation prompt** runs per user, given all their existing memories at once. Output discards transient tasks, deduplicates, picks best version of conflicting claims.

**Predicted outcomes:**

| User | Before | After (predicted) | Notes |
|---|---|---|---|
| Anirudh (`3ae2fd19`) | 13 | 5–7 | 4 conflicting names → 1 |
| SEO user (`58259b3e`) | 51 | 5–10 | 31 transient blog requests discarded |
| Other 15 users | ~107 | ~50–60 | Variable |
| **Total** | **171** | **~80–100** | ~50% discarded as transient noise |

**Cost:** ~$0.02. **Rollback:** UserMemory renamed to UserMemoryArchive; 30-day window.

### 2e. User-facing UI

Route: `/settings/memory` (mirrors Claude.ai pattern).

Sections grouped by FactCategory. Each fact shows content, source icon (🤖 extracted / ✋ user-added / 📦 migrated), edit pencil, delete trash. Pause-memory toggle. "Add fact about me" button. "Clear all memory" nuclear option.

**API endpoints (new file `routes/userFactRoutes.ts`):**

```
GET    /api/user/facts                # list grouped by category
POST   /api/user/facts                # add (USER_ADDED)
PATCH  /api/user/facts/:id            # edit
DELETE /api/user/facts/:id            # soft delete
DELETE /api/user/facts?category=X     # bulk delete
DELETE /api/user/facts/all            # nuclear
GET    /api/user/facts/preferences    # pause status
PATCH  /api/user/facts/preferences    # toggle pause
```

All scoped to `req.user.id`. No cross-user access.

### 2f. Today's filter — fate

`filterMemoryQuality` (today's `b7ef03e`) stays active during phases 3–5. Retired only after new retrieval is fully active and stable. Removal is a separate commit.

| Phase | Filter status |
|---|---|
| Day 2 (schema) | Active on old vector path |
| Day 3 (extraction job) | Active, dual-write |
| Day 4 (retrieval cutover) | No longer in path; new retrieval doesn't need it |
| Day 5+ (migration, UI) | Filter code removed |

---

## Day-by-day build sequence

Aggressive but realistic. Each day = focused 4–6 hour block.

| Day | Focus | Hours | Deliverable |
|---|---|---|---|
| 2 (today) | **Schema migration** | 5–6 | `UserFact` + `UserConversationSummary` + `UserMemoryArchive` migrated; deployed; API scaffolds return empty |
| 3 | Fact extraction pipeline | 5–6 | LLM call, JSON parse, cron job. Tested on 5–10 sample conversations |
| 4 | New retrieval logic | 4–5 | Query-type → category mapping. New prompt format. Wired behind `USE_USER_FACTS` flag (OFF in prod) |
| 5 | Migration of 171 legacy rows | 3–4 | Run on staging, manual review, then prod. Flip flag ON for test users |
| 6 | Frontend memory settings UI | 5–6 | `/settings/memory` route, CRUD operations |
| 7 | Wider rollout, retire old filter | 3–4 | Flag ON for all users; monitor extraction quality; remove `filterMemoryQuality` |

**Total: ~30–35 hours over 6 days.**

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Extraction prompt produces bad facts | Manual review of first 50 extractions, iterate prompt |
| LLM hallucinates non-existent facts | Confidence threshold + user-facing UI to delete |
| Background job fails silently | Healthcheck endpoint + alerting on missed runs |
| Migration discards too aggressively | Run on staging first, manual review of discards |
| Frontend UI bugs delete user facts | Confirmation modal + soft-delete (active=false) audit trail |
| Race conditions on supersession | Single-extractor-per-user lock during job |
| Existing chat path breaks during transition | Feature flag for instant rollback |

---

## Constraints carrying forward

- Single concern per commit (schema migration today; extraction tomorrow; retrieval after that)
- Probe-first before each ship
- Verification probes must pass before commit
- Filter (`b7ef03e`) stays active until retrieval cutover proven stable
- Rollback path preserved at every step (UserMemoryArchive, feature flags, soft-delete)

---

## What's next (Day 2 — starts immediately after this commit)

1. Add `UserFact`, `UserConversationSummary`, `FactCategory`, `FactSource` to `backend/prisma/schema.prisma`
2. Generate Prisma migration: `npx prisma migrate dev --name add_user_fact_tables`
3. Apply to production after review
4. Scaffold `routes/userFactRoutes.ts` with empty handlers (returns `[]`)
5. Register routes in `server.ts`
6. Verify schema deploy doesn't break existing UserMemory path
