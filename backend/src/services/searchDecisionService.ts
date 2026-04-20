/**
 * Search Decision Service
 *
 * Decides whether a user message warrants a web search, and if so,
 * produces an optimized search query.
 *
 * Layers (in order):
 *   1. Hard overrides — instant rule-based rules that are
 *      unambiguous either way (code shape, explicit "don't search"
 *      / "search the web", etc.). No AI call needed.
 *   2. AI classifier — asks a cheap/fast model (GPT-5.4 Nano by
 *      default, overridable via SEARCH_DECISION_MODEL env var)
 *      whether the message needs live data. The model also
 *      returns an optimized search query.
 *   3. Rules fallback — if the AI call fails or times out, defer
 *      to the existing needsWebSearch heuristic in
 *      webSearchService so behaviour never worse than before.
 *
 * Billing note: the AI decision call is platform overhead. We do
 * NOT create a UsageLog row or deduct from the user's wallet for
 * it — the cost (~$0.0001 per query at Nano rates) is absorbed.
 */

import axios from 'axios';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { needsWebSearch as rulesBasedNeedsWebSearch } from './webSearchService.js';

const DEFAULT_DECISION_MODEL = process.env.SEARCH_DECISION_MODEL || 'gpt-5.4-nano';
const DECISION_TIMEOUT_MS = 1500;

export interface SearchDecision {
  needsSearch: boolean;
  searchQuery: string | null;
  reason: string;
  /** Where the decision came from — useful for logging and metrics. */
  source: 'hard_override_no' | 'hard_override_yes' | 'ai' | 'rules_fallback';
}

export interface DecideOptions {
  hasDocumentContext?: boolean;
}

// ── Layer 1: hard overrides ────────────────────────────────────────────

/**
 * Messages that are almost-certainly NOT a search request regardless
 * of what the AI might guess. Returning true short-circuits to "no
 * search" without consulting the AI.
 */
function isHardOverrideNoSearch(message: string): boolean {
  // User explicitly opted out
  if (/\b(don'?t|do not|no need to|please don'?t|without)\s+(search|google|look\s*up|web\s*search)\b/i.test(message)) {
    return true;
  }

  // Meta-question about the capability itself — handled here too so the
  // AI layer never sees it and can't hallucinate a "yes search" answer.
  if (isMetaCapabilityQuestion(message)) {
    return true;
  }

  // ── Strong structural signals that the message contains code ──
  // These fire on the shapes themselves regardless of how much of the
  // message is code. One shortcode or HTML tag mixed into a sentence is
  // still clearly "user is showing me code", not "user is asking a
  // search query".

  // Shortcodes: [prefix* name attr="value"] — CF7, WordPress, etc.
  //   [select* course-date "June 01, 2026"]
  //   [contact-form-7 id=5]
  if (/\[[a-z_][\w-]{1,}\*?(?:\s+[\w-]|\s*\])/i.test(message)) return true;

  // HTML tags: <div ...>, <br/>, <!-- comment -->
  if (/<[a-z][\w-]*(?:\s+[\w-]+(?:\s*=\s*["'][^"']*["'])?)*\s*\/?>/i.test(message)) return true;
  if (/<!--[\s\S]*?-->/.test(message)) return true;

  // Fenced code block — user is showing us code to work with
  if (/```/.test(message)) return true;

  // SQL statements
  if (/\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(message)) return true;

  // Starts with { or [ (JSON, array, shortcode, code snippet)
  if (/^\s*[{[]/.test(message)) return true;

  // Fallback: dense with syntax chars — catches multi-line code snippets
  // that don't match the structural rules above. 15% threshold still
  // well above normal prose (~2–4%).
  const codeLikeChars = message.match(/[\[\]{}()<>=;:/\\|@#$%^&*`~]/g);
  if (codeLikeChars && codeLikeChars.length / message.length > 0.15) {
    return true;
  }

  return false;
}

/**
 * Meta-questions about the assistant's capabilities — "do you do web
 * search?", "can you search the web?", "is web search supported?".
 * The user is asking ABOUT the feature, not asking to use it on a
 * specific topic, so don't trigger a search.
 */
function isMetaCapabilityQuestion(message: string): boolean {
  // "do you do/have/support web search", "is web search supported/available"
  if (/\b(do|does|can|could|are|will|would|is|was)\s+(you|there|this|it|web\s*search)\b[^?.!]*\b(search|google|browse|look\s*up|web\s*search)\b\s*\??/i.test(message)) {
    // …unless it clearly names an object to search for (e.g. "can you
    // search the web for the current weather in Seattle"). A short
    // bare-capability question has no "for <topic>" tail.
    const hasRealObject = /\b(for|about|on)\b\s+\S+\s+\S+/i.test(message);
    if (!hasRealObject) return true;
  }
  return false;
}

/**
 * Messages where the user explicitly asked us to search. Short-circuits
 * to "yes search" without consulting the AI.
 */
function isHardOverrideYesSearch(message: string): boolean {
  const explicit = /\b(search\s+(the\s+)?(web|internet|online|for)|google\s+(this|for|it)|look\s*up\s+(online|on\s*(the\s*)?web)|browse\s+(online|the\s*web))\b/i;
  if (!explicit.test(message)) return false;
  // Meta-capability question — user is asking whether we CAN search,
  // not asking us to search something specific.
  if (isMetaCapabilityQuestion(message)) return false;
  // …but not if they're asking about how a code-level "search" works
  if (/\b(code|function|script|shortcode|syntax|css|html|sql|regex|array|string)\b/i.test(message)) return false;
  return true;
}

// ── Layer 2: AI decision ───────────────────────────────────────────────

interface RawAIDecision {
  needs_search: boolean;
  search_query: string | null;
  reason: string;
}

const DECISION_PROMPT_TEMPLATE = (userMessage: string) => `You are a search-decision engine for an AI chat assistant.

DECIDE whether the user's message requires a live web search to answer well.

Return needs_search=true ONLY if the answer depends on information you don't have:
- current events, breaking news, today's headlines
- live data: prices, stock, crypto, weather, scores
- recent releases (products, papers, announcements after your cutoff)
- specific URLs or sites the user wants you to read
- facts that change frequently (who currently leads X, market cap of Y, etc.)

Return needs_search=false for:
- code help, shortcodes, markup, syntax
- writing, translation, formatting, editing
- math, logic, analysis
- general knowledge, explanations of concepts
- how-to questions where the answer comes from understanding
- anything where quoted dates or numbers are DATA the user is showing you (not things to look up)
- META-QUESTIONS about the assistant's own capabilities ("do you do web search?", "can you browse the web?", "is search supported?") — the user is asking ABOUT the feature, not asking to use it on a specific topic. Never search for these.

If search IS needed, return a concise 2–6 word search_query — the CONCEPT, not the user's full sentence. Strip quotes, code, and filler.

USER MESSAGE:
${userMessage}

Respond with ONLY valid JSON, no prose, no code fence:
{"needs_search": true|false, "search_query": "…" or null, "reason": "short sentence"}`;

async function aiDecide(userMessage: string): Promise<SearchDecision | null> {
  const apiKey = config.apiKeys.openai;
  if (!apiKey) return null;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: DEFAULT_DECISION_MODEL,
        messages: [{ role: 'user', content: DECISION_PROMPT_TEMPLATE(userMessage) }],
        max_tokens: 120,
        temperature: 0,
        response_format: { type: 'json_object' },
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: DECISION_TIMEOUT_MS,
      },
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text) return null;

    const parsed = JSON.parse(text) as Partial<RawAIDecision>;
    return {
      needsSearch: !!parsed.needs_search,
      searchQuery: parsed.search_query || null,
      reason: parsed.reason || 'ai_decision',
      source: 'ai',
    };
  } catch (err: any) {
    logger.warn(`Search decision AI call failed: ${err?.message || err}`);
    return null;
  }
}

// ── Public entry point ─────────────────────────────────────────────────

/**
 * Ask the layered decision system whether this message needs web
 * search. Always returns a decision; never throws.
 */
export async function decideWebSearch(
  userMessage: string,
  opts: DecideOptions = {},
): Promise<SearchDecision> {
  const msg = userMessage.trim();

  // Very short inputs and document-analysis turns never search —
  // these are cheap fast-exits matching the old rules-based behaviour.
  if (msg.length < 15 || opts.hasDocumentContext) {
    return {
      needsSearch: false,
      searchQuery: null,
      reason: opts.hasDocumentContext ? 'document context attached' : 'message too short',
      source: 'hard_override_no',
    };
  }

  // Layer 1 — hard overrides
  if (isHardOverrideNoSearch(msg)) {
    return {
      needsSearch: false,
      searchQuery: null,
      reason: 'code-shaped input or explicit no-search request',
      source: 'hard_override_no',
    };
  }
  if (isHardOverrideYesSearch(msg)) {
    return {
      needsSearch: true,
      searchQuery: msg,
      reason: 'user explicitly asked to search',
      source: 'hard_override_yes',
    };
  }

  // Layer 2 — AI decision
  const aiResult = await aiDecide(msg);
  if (aiResult) return aiResult;

  // Layer 3 — rules fallback (preserves prior behaviour if AI is down)
  const rulesSaysYes = rulesBasedNeedsWebSearch(msg, !!opts.hasDocumentContext);
  return {
    needsSearch: rulesSaysYes,
    searchQuery: rulesSaysYes ? msg : null,
    reason: 'AI classifier unavailable — rules fallback',
    source: 'rules_fallback',
  };
}
