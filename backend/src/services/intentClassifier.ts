/**
 * Intent Classifier — Detects what the user is trying to accomplish.
 *
 * Fast rule-based classification (0ms, 0 tokens). Scoring rewards MORE
 * matches (not ratio of matches to total patterns, which inverted the
 * intended behavior). A rule with 7 patterns matching 3 now scores higher
 * than a rule with 2 patterns matching 1 — as it should.
 *
 * This feeds the orchestration layer: a classified intent drives which
 * task-specific prompt and parameters are used for the AI call.
 */

import logger from '../config/logger.js';

export type TaskIntent =
  | 'conversation'      // casual chat, greetings, small talk
  | 'question'          // factual questions, explanations, how-to
  | 'long_form_writing' // blog posts, articles, essays, reports, emails
  | 'creative_writing'  // stories, poems, scripts, creative content
  | 'coding'            // write code, debug, review, architect
  | 'analysis'          // compare, analyze, evaluate, strategy
  | 'math'              // calculations, equations, proofs
  | 'translation'       // translate between languages
  | 'research'          // deep research with multiple sources
  | 'instruction'       // step-by-step guides, tutorials, recipes
  | 'extraction'        // summarize, extract data, parse documents
  | 'editing';          // rewrite, proofread, improve existing text

export interface ClassifiedIntent {
  intent: TaskIntent;
  confidence: number;
  temperature: number;
  maxTokens: number;
  shouldStream: boolean;
  needsWebSearch: boolean;
  formatHint: 'prose' | 'structured' | 'code' | 'minimal' | 'document';
}

interface IntentRule {
  intent: TaskIntent;
  patterns: RegExp[];
  temperature: number;
  formatHint: ClassifiedIntent['formatHint'];
  maxTokens: number;
}

const INTENT_PATTERNS: IntentRule[] = [
  // LONG-FORM WRITING — blog posts, articles, SEO content, reports
  {
    intent: 'long_form_writing',
    patterns: [
      /\b(write|draft|create|compose|generate)\b.{0,30}\b(blog|article|post|essay|report|whitepaper|case study|guide|content|copy|page|newsletter|press release)\b/i,
      /\b(SEO|AEO|GEO|keyword|meta description|H1|H2|featured snippet|search intent)\b/i,
      /\b(word count|\d{2,4}\s*(?:words|-?\s*word))\b/i,
      /\bwrite\b.{0,50}\b(about|on|for|regarding|covering)\b.{15,}/i,
      /\b(blog|article|post)\b.{0,30}\b(topic|title|headline|outline)\b/i,
    ],
    temperature: 0.7,
    formatHint: 'document',
    maxTokens: 16384,
  },

  // CODING — write, debug, review, architect code
  {
    intent: 'coding',
    patterns: [
      /\b(code|function|class|component|module|script|endpoint|API|route|controller|service|middleware)\b/i,
      /\b(debug|fix|error|bug|crash|exception|stack trace|TypeError|ReferenceError|SyntaxError|undefined|null)\b/i,
      /\b(python|javascript|typescript|java|rust|golang|react|node|express|laravel|django|flask|nextjs|vue|angular|swift|kotlin|c\+\+|c#)\b/i,
      /\b(implement|refactor|optimize|build)\b.{0,20}\b(function|class|component|API|endpoint|system|app|module|feature)\b/i,
      /\b(SQL|query|database|schema|migration|ORM|prisma|sequelize|mongoose|postgres|mysql|mongodb)\b/i,
      /\b(git|docker|kubernetes|CI\/CD|deploy|nginx|AWS|GCP|Azure|lambda|s3|ec2)\b/i,
      /```[\s\S]*?```/,
    ],
    temperature: 0.2,
    formatHint: 'code',
    maxTokens: 16384,
  },

  // CREATIVE WRITING — stories, poems, scripts
  {
    intent: 'creative_writing',
    patterns: [
      /\b(write|create|compose)\b.{0,20}\b(story|poem|script|novel|chapter|scene|dialogue|lyrics|song|haiku|limerick|sonnet|screenplay)\b/i,
      /\b(fiction|narrative|character|plot|setting|protagonist|antagonist|worldbuilding)\b/i,
      /\b(once upon|in a world|imagine|picture this|short story)\b/i,
    ],
    temperature: 0.85,
    formatHint: 'prose',
    maxTokens: 16384,
  },

  // ANALYSIS — compare, evaluate, strategy, data
  {
    intent: 'analysis',
    patterns: [
      /\b(compare|versus|vs\.?|comparison|evaluate|assess|analyze|analyse|benchmark)\b/i,
      /\b(pros and cons|advantages|disadvantages|trade-?offs?|strengths|weaknesses|SWOT)\b/i,
      /\b(strategy|strategic|roadmap|framework|approach|methodology)\b/i,
      /\b(data|metrics|KPI|ROI|performance|statistics|trends|forecast)\b/i,
      /\b(which is better|should I choose|recommend|best option|which one)\b/i,
    ],
    temperature: 0.4,
    formatHint: 'structured',
    maxTokens: 8192,
  },

  // RESEARCH — deep investigation, multiple sources
  {
    intent: 'research',
    patterns: [
      /\b(research|investigate|deep dive|comprehensive|thorough|in-depth|detailed analysis)\b/i,
      /\b(literature review|state of the art|current landscape|market research)\b/i,
      /\b(find|search|look up|what do we know about)\b.{15,}/i,
    ],
    temperature: 0.3,
    formatHint: 'structured',
    maxTokens: 16384,
  },

  // INSTRUCTION — step-by-step, how-to, tutorials
  {
    intent: 'instruction',
    patterns: [
      /\b(how to|how do I|steps to|guide|tutorial|walkthrough|instructions)\b/i,
      /\b(step by step|step-by-step|process|procedure|workflow)\b/i,
      /\b(set up|setup|install|configure|deploy|migrate)\b/i,
    ],
    temperature: 0.3,
    formatHint: 'structured',
    maxTokens: 8192,
  },

  // EXTRACTION — summarize, extract, parse
  {
    intent: 'extraction',
    patterns: [
      /\b(summarize|summary|summarise|extract|parse|pull out|key points|main points|TL;?DR)\b/i,
      /\b(condense|shorten|brief|overview|recap|digest)\b/i,
    ],
    temperature: 0.2,
    formatHint: 'structured',
    maxTokens: 4096,
  },

  // EDITING — rewrite, proofread, improve
  {
    intent: 'editing',
    patterns: [
      /\b(rewrite|re-write|rephrase|paraphrase|proofread|edit|revise|polish|refine)\b/i,
      /\b(grammar|spelling|tone|style|clarity|concise|formal|informal)\b/i,
      /\b(make it|change it to|convert to|transform)\b.{0,20}\b(better|shorter|longer|formal|casual|professional)\b/i,
    ],
    temperature: 0.4,
    formatHint: 'prose',
    maxTokens: 8192,
  },

  // MATH — calculations, equations, proofs
  {
    intent: 'math',
    patterns: [
      /\b(calculate|solve|equation|formula|integral|derivative|proof|theorem)\b/i,
      /\b(algebra|calculus|statistics|probability|geometry|trigonometry)\b/i,
      /\d+\s*[+\-*/^]\s*\d+/,
    ],
    temperature: 0.1,
    formatHint: 'structured',
    maxTokens: 4096,
  },

  // TRANSLATION
  {
    intent: 'translation',
    patterns: [
      /\b(translate|translation|interpret)\b/i,
      /\b(to|into|in)\b\s+(english|spanish|french|german|chinese|japanese|korean|arabic|hindi|portuguese|russian|italian)\b/i,
    ],
    temperature: 0.2,
    formatHint: 'prose',
    maxTokens: 4096,
  },

  // QUESTION — factual, explanatory (catch-all before conversation)
  {
    intent: 'question',
    patterns: [
      /^(what|who|where|when|why|how|which|is|are|can|does|do|will|would|should|could)\b/i,
      /\?\s*$/,
      /\b(explain|describe|define|tell me about|what is|what are)\b/i,
    ],
    temperature: 0.5,
    formatHint: 'prose',
    maxTokens: 4096,
  },
];

const CONVERSATION_DEFAULT: ClassifiedIntent = {
  intent: 'conversation',
  confidence: 0.95,
  temperature: 0.7,
  maxTokens: 1024,
  shouldStream: true,
  needsWebSearch: false,
  formatHint: 'minimal',
};

/**
 * Score a rule against the message.
 *
 * New formula: `score = min(matchCount * 0.25 + 0.2, 1.0)`
 *   1 match = 0.45, 2 matches = 0.70, 3 matches = 0.95, 4+ = 1.0
 *
 * This rewards more matches without penalizing rules that define more
 * patterns (the previous ratio-based formula gave higher scores to rules
 * with fewer patterns, which was backwards).
 */
function scoreRule(rule: IntentRule, text: string, contextBoost: number): number {
  let matchCount = 0;
  for (const pattern of rule.patterns) {
    if (pattern.test(text)) matchCount++;
  }
  if (matchCount === 0) return 0;

  const base = Math.min(matchCount * 0.25 + 0.2, 1.0);
  const boost = (rule.intent === 'extraction' || rule.intent === 'analysis') ? contextBoost : 0;
  return Math.min(base + boost, 1.0);
}

export function classifyIntent(message: string, hasDocumentContext = false): ClassifiedIntent {
  const trimmed = (message || '').trim();

  // Very short messages → conversation
  if (trimmed.length < 15 || /^(hey+|hi+|hello|yo|sup|thanks|thx|ok|okay|bye|gm|gn|good\s+(morning|night|evening))[\s!?.]*$/i.test(trimmed)) {
    return { ...CONVERSATION_DEFAULT };
  }

  const contextBoost = hasDocumentContext ? 0.1 : 0;

  let bestMatch: ClassifiedIntent | null = null;
  let bestScore = 0;

  for (const rule of INTENT_PATTERNS) {
    const score = scoreRule(rule, trimmed, contextBoost);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        intent: rule.intent,
        confidence: score,
        temperature: rule.temperature,
        maxTokens: rule.maxTokens,
        shouldStream: true,
        needsWebSearch: false,
        formatHint: rule.formatHint,
      };
    }
  }

  if (bestMatch && bestScore >= 0.4) {
    logger.info(`Intent: ${bestMatch.intent} (conf=${bestMatch.confidence.toFixed(2)}) "${trimmed.substring(0, 80)}"`);
    return bestMatch;
  }

  // Fallback: long-enough text is probably a question, otherwise conversation
  if (trimmed.length > 30) {
    return {
      intent: 'question',
      confidence: 0.4,
      temperature: 0.5,
      maxTokens: 4096,
      shouldStream: true,
      needsWebSearch: false,
      formatHint: 'prose',
    };
  }

  return { ...CONVERSATION_DEFAULT, confidence: 0.5 };
}
