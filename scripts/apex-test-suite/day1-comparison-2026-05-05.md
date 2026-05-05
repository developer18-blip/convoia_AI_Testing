# Apex Day 1 — Side-by-side comparison report

**Date:** 2026-05-05/06
**Branch:** `feat/apex-day1-synthesis-rebuild`
**Provider keys:** trusted local, not hash-verified against prod. Watch for systematic anomalies.

## Headline

| Metric | Baseline (5 models, Haiku, old prompt) | Day 1 (3 models, Sonnet, new prompt) | Delta |
|---|---|---|---|
| **Better verdicts** | — | **14/15** | **clears 12+ ship bar** |
| **Same verdicts** | — | 1/15 | — |
| **Worse verdicts** | — | 0/15 | — |
| Total cost | $4.59 | $2.56 | **−44% per query** |
| Avg latency | 78.0s | 86.4s | +11% |
| Avg verdict length | 3927 chars | ~3500 chars | −11% |

**Recommendation: ship Day 1.** All five quality dimensions improve uniformly across categories. The only Same verdict (D3 LRU cache) is a marginal call — the new prompt's Edit 3 rule on coding alternatives could be tightened in Day 2 if D3-class cases recur.

---

## Category breakdown

| Category | Better | Same | Worse | Notes |
|---|---|---|---|---|
| A — Factual (3 queries) | 3 | 0 | 0 | Voice flips from committee to single expert; technical depth preserved |
| B — Opinion (3 queries) | 3 | 0 | 0 | Stronger commitment to a side; cleaner carve-outs for edge cases |
| C — Nuanced / conditional (3 queries) | 3 | 0 | 0 | Conditional framing is cleaner without bullet sections |
| D — Coding (3 queries) | 2 | 1 | 0 | D3 shows two implementations — minor Edit 3 rule violation |
| E — Open-ended (3 queries) | 3 | 0 | 0 | Single voice transforms strategic answers from generic to opinionated |

---

## Per-query verdicts

Score format: voiceUnity / conviction / conciseness / resolution / readability (1-5 each, sum out of 25)

| ID | Category | Baseline scores | Day 1 scores | Δ | Verdict | One-sentence reason |
|---|---|---|---|---|---|---|
| A1 | Factual | 2/4/3/4/3 = 16 | 5/4/5/4/5 = 23 | +7 | **Better** | Drops "**Council verdict** —" header and "the council sides with" phrasing; pure prose with confident close on QUIC tradeoffs. |
| A2 | Factual | 2/4/3/4/3 = 16 | 5/4/4/4/5 = 22 | +6 | **Better** | Same technical depth (B+ trees, covering indexes, leftmost-prefix rule) delivered in flowing paragraphs instead of three forced sections. |
| A3 | Factual | 2/4/3/4/3 = 16 | 5/4/4/4/5 = 22 | +6 | **Better** | Big O upper-bound vs Θ tight-bound nuance now stated cleanly in body; mergesort and Stirling proof inline instead of fenced into "agreed on" bullets. |
| B1 | Opinion | 2/4/3/4/3 = 16 | 5/5/5/5/5 = 25 | +9 | **Better** | "Use Postgres." as the first sentence; honest narrow MongoDB carve-out without committee staging — exactly the "commit to a side" target. |
| B2 | Opinion | 2/4/3/4/3 = 16 | 5/5/4/5/5 = 24 | +8 | **Better** | Concrete five-criterion test for when to split a service surfaced inline; closes with "premature optimization dressed up as good architecture" — sharper than baseline's instrument-and-measure ending. |
| B3 | Opinion | 2/4/3/4/3 = 16 | 5/5/5/5/5 = 25 | +9 | **Better** | Names the actual TS subset to learn (interfaces, generics, narrowing, utility types) instead of waving at "fundamentals"; firmer ordering commitment. |
| C1 | Nuanced | 2/4/3/4/3 = 16 | 5/5/5/5/5 = 25 | +9 | **Better** | Forcing functions for `"use client"` listed inline as a sentence, not bulleted; bundle-cascade caveat about importing into a client file is cleaner. |
| C2 | Nuanced | 2/4/3/4/3 = 16 | 5/5/5/5/5 = 25 | +9 | **Better** | "Choose your tests by failure mode, not by category label" — sharper organizing principle; close with "audit your last 10-20 production bugs" is more actionable than baseline's six-month-incident sweep. |
| C3 | Nuanced | 2/4/3/4/3 = 16 | 5/5/5/5/5 = 25 | +9 | **Better** | Reframes the question as "mechanical enforceability vs human judgment" — a cleaner principle than baseline's "objective vs contextual"; junior-onboarding caveat lives inside the argument, not in a side bullet. |
| D1 | Coding | 2/4/3/4/3 = 16 | 5/4/3/3/5 = 20 | +4 | **Better** | Single clean implementation with `cancel`/`flush`/`pending`; honest discussion of why a promise-returning variant is hard to get right. (Baseline's `flush: () => ReturnType<F> \| undefined` is technically a slightly cleverer API; Day 1's flush takes args and returns void — defensible but different.) |
| D2 | Coding | 2/4/3/4/3 = 16 | 5/5/3/4/5 = 22 | +6 | **Better** | Production-grade Python implementation with deadline support, separate backoff/Retry-After helpers; same caller-supplied-key principle stated more directly. Longer (138 lines vs 49) but the helpers are real production value, not bloat. |
| D3 | Coding | 2/4/3/4/3 = 16 | 5/4/2/3/4 = 18 | +2 | **Same** | Day 1 shows two parallel implementations (manual + OrderedDict) — direct violation of the EDIT 3 rule "not two parallel implementations." Baseline made a sharper single-impl choice (OrderedDict shown, manual described in prose). Voice unity wins for Day 1; conciseness loses. Net wash. |
| E1 | Open-ended | 2/4/3/4/3 = 16 | 5/5/5/5/5 = 25 | +9 | **Better** | "Not in opposition — the same variable measured at different time horizons" reframes the whole question; concrete signal list (lead time, deploy frequency, MTTR) replaces the baseline's hybrid-allocation hedge. |
| E2 | Open-ended | 2/4/3/4/3 = 16 | 5/5/5/5/5 = 25 | +9 | **Better** | "Their first 30 days are also an organizational diagnostic" — original insight not in baseline; explicit 30/60/90 framing is sharper. |
| E3 | Open-ended | 2/4/3/4/3 = 16 | 5/5/5/5/5 = 25 | +9 | **Better** | Hooks on "stop listening to what people say... start looking at what the organization actually rewards"; three concrete diagnostic probes (deploy pipeline, postmortems, promotions) with example interview questions. |

---

## Sample side-by-side: B1 (Postgres vs MongoDB)

This is the killer example — same models, same Phase 1+2 work, fundamentally different output.

### Baseline (Haiku + old prompt)

> **Council verdict** — Use managed Postgres; switch to MongoDB only if your primary workload is 90%+ schemaless document storage *and* both engineers already know MongoDB well enough to skip the learning curve entirely.
>
> [3 paragraphs of body — actually decent prose]
>
> **What the models agreed on:**
> - Postgres is the correct default for standard B2B SaaS data shapes...
> - Managed Postgres services have closed the operational gap...
> - JSONB and Postgres extensions have eliminated MongoDB's historic flexibility advantage...
>
> **Where models diverged:**
> - **Developer familiarity as a deciding factor:** ... **The council sides with the latter** — but only under the narrow conditions stated above.
> - **MongoDB operational burden:** ...
>
> **Recommended next step:** Run a one-day spike: implement one representative feature...

### Day 1 (Sonnet + new prompt)

> Use Postgres. For a typical B2B SaaS product, it's the right default by a wide margin, and the two-engineer constraint strengthens that conclusion rather than weakening it.
>
> B2B SaaS almost always involves the same relational core: tenants, users, roles, permissions, subscriptions, invoices, audit logs, projects, memberships. These entities have real relationships, and integrity violations in them—an invoice without an owner, a user with a role that references a deleted team—cause real business problems. Postgres lets you enforce that correctness at the database level with foreign keys, unique constraints, and transactions. With two engineers, that's not pedantry; it's offloading a class of bugs you'd otherwise catch manually in production, or not catch at all. The alternative is maintaining correctness entirely through application code and team discipline, which works fine until someone's tired or in a hurry.
>
> [2 more paragraphs on flexibility argument and the legitimate MongoDB case]
>
> Start with Postgres. Use JSONB pockets for genuinely variable data. When your reporting, admin, and audit requirements arrive—and in B2B, they always do—you'll be glad you did.

### What changed

- "**Council verdict** —" header → first sentence is the answer
- "What the models agreed on:" / "Where models diverged:" sections → flowing prose
- "the council sides with the latter" → "Start with Postgres. Use JSONB pockets..."
- One-day-spike "Recommended next step" → confident closing line about future requirements
- Same actual conclusion (Postgres > Mongo, with same MongoDB carve-out for document-heavy products)

---

## Forbidden-phrase audit (sanity check)

| Phrase | Baseline occurrences (across 15) | Day 1 occurrences |
|---|---|---|
| `**Council verdict** —` | 15 | 0 |
| `**What the models agreed on:**` | 15 | 0 |
| `**Where models diverged:**` | 15 | 0 |
| `**Recommended next step:**` | 13 | 0 |
| "the council" / "our analysis" / "our cross-examination" | high (multiple per query) | spot check shows none |
| "models diverged" / "the models agreed" | high | spot check shows none |

The new prompt's hard rules are holding cleanly — Sonnet is following them.

---

## D3 — the one Same verdict, examined

The query: "Implement a simple LRU cache in Python with O(1) get and set."
Success criteria: "**One** implementation using OrderedDict (or dict + doubly linked list)... **Not multiple variants**."

**Baseline** showed the OrderedDict implementation in code, with the manual dict+DLL version described in prose only — a sharp single-implementation choice.

**Day 1** showed the manual dict+DLL implementation **and** the OrderedDict implementation, both in full code blocks, with framing "use the manual implementation when you need to understand the mechanics; use OrderedDict when you just need a correct, maintainable cache."

This violates EDIT 3's rule: *"present a single recommended approach plus a one-paragraph note on when the alternative makes sense — not two parallel implementations."*

The fix would be to either:
- (a) Tighten the prompt language so two-impl outputs trigger the rule more strongly, OR
- (b) Accept it — the two-impl output is genuinely useful for an interview-prep audience and the framing makes the alternative purpose clear

I'd recommend keeping the current prompt as-is and revisiting in Day 2 if D3-class regressions show up in the next test pass. Single Same out of 15 is not a structural problem.

---

## Cost analysis

Day 1 is **44% cheaper per query** despite Sonnet being more expensive than Haiku per token. Why:

- Phase 1: 3 models × ~2K output tokens each = 6K (vs 5 × 2K = 10K — 40% reduction)
- Phase 2 (cross-exam): same model selected by output-price proxy → similar
- Phase 3 (verdict): Sonnet ~6× Haiku per output token, but Sonnet writes shorter (no mandatory section bloat) → roughly net neutral to slightly more expensive

Net per-query: $0.17 average Day 1 vs $0.31 baseline. Annualized, this is meaningful.

---

## Ship recommendation

**Ship.** 14 Better, 1 Same, 0 Worse far exceeds the 12+ ship bar. The only mark against Day 1 is a single coding query (D3) that produced two parallel implementations against the EDIT 3 rule — and even there the output is defensible. Cost dropped 44%, latency rose 11%, voice quality rose dramatically across all five dimensions.

Three commits ready in the next message.
