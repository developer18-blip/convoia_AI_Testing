/**
 * Deep Research Service — 4-Stage Expert Research Pipeline
 *
 * Simulates how a human expert researches a problem:
 *
 * Stage 1: Intent + Depth Detection (instant, rule-based)
 * Stage 2: Clarification (if query is vague — ask before answering)
 * Stage 3: Deep Research — Hypothesis Building + Multi-Angle Reasoning (Pass 1)
 * Stage 4: Iterative Refinement — Self-Critique + Polish (Pass 2, streaming)
 *
 * The AI should feel like a consultant, researcher, and strategist — not a chatbot.
 */

import logger from '../config/logger.js';

// ── Types ────────────────────────────────────────────────────────────

export type DepthLevel = 'surface' | 'deep' | 'research';
export type TaskType = 'factual' | 'analytical' | 'research' | 'coding' | 'creative' | 'strategic' | 'general';

export interface QueryAnalysis {
  needsClarification: boolean;
  confidenceScore: number;     // 0–1
  depthLevel: DepthLevel;      // how deep should we go
  taskType: TaskType;
  reasons: string[];
  hypotheses: string[];        // possible interpretations of the query
}

// ── Stage 1: Intent + Depth Detection ────────────────────────────────

/**
 * Analyze a user query to determine:
 * - What kind of task is it? (factual, analytical, research, coding, creative, strategic)
 * - How deep should we go? (surface, deep, research)
 * - Is clarification needed? (confidence < 0.6)
 * - What are possible interpretations? (hypothesis building)
 *
 * Rule-based — no model call, instant.
 */
export function analyzeQuery(
  query: string,
  messageHistory: Array<{ role: string; content: string }>
): QueryAnalysis {
  const reasons: string[] = [];
  const hypotheses: string[] = [];
  let confidence = 0.8;

  const words = query.trim().split(/\s+/);
  const wordCount = words.length;
  const hasConversationContext = messageHistory.filter(m => m.role === 'user').length > 1;
  const hasDocumentContext = query.includes('Here is the attached document content:');
  const queryLower = query.toLowerCase();

  // ── Task type detection ──
  let taskType: TaskType = 'general';

  if (/\b(code|function|class|api|bug|error|debug|implement|refactor|regex|sql|query|script|deploy|docker|git|build|compile|test|migrate)\b/i.test(query)) {
    taskType = 'coding';
  } else if (/\b(strategy|scale|grow|monetize|pricing|positioning|market|compete|business model|roadmap|launch|pivot|hire|fundrais)\b/i.test(query)) {
    taskType = 'strategic';
  } else if (/\b(analyze|compare|evaluate|assess|benchmark|audit|review|performance|metrics|data|statistics|trend|trade-?off|pros|cons)\b/i.test(query)) {
    taskType = 'analytical';
  } else if (/\b(research|investigate|find out|explore|study|deep dive|how does|how do|why does|why do|explain.*work|explain.*mechanism)\b/i.test(query)) {
    taskType = 'research';
  } else if (/\b(what is|who is|when did|where is|define|meaning of)\b/i.test(query) && wordCount < 15) {
    taskType = 'factual';
  } else if (/\b(write|create|draft|design|brainstorm|generate|story|poem|content|marketing|email|blog|copy)\b/i.test(query)) {
    taskType = 'creative';
  }

  // ── Depth level detection ──
  let depthLevel: DepthLevel = 'deep'; // default for thinking mode

  // Surface: simple factual queries
  if (taskType === 'factual' && wordCount < 12) {
    depthLevel = 'surface';
  }

  // Research: complex multi-faceted problems
  const RESEARCH_SIGNALS = [
    /\b(how (to|should|can|do I)|best (way|approach|practice|strategy))\b/i,
    /\b(compare|versus|vs|trade-?off|alternative|which is better)\b/i,
    /\b(architecture|design|system|infrastructure|scale|optimize|strategy|plan)\b/i,
    /\b(why (is|are|does|do|should|would)|what causes|root cause)\b/i,
    /\b(comprehensive|in-?depth|detailed|thorough|complete|full)\b/i,
  ];
  const researchSignalCount = RESEARCH_SIGNALS.filter(p => p.test(query)).length;
  if (researchSignalCount >= 2 || (researchSignalCount >= 1 && wordCount >= 20)) {
    depthLevel = 'research';
  }
  if (taskType === 'strategic') depthLevel = 'research';

  // ── Hypothesis building (possible interpretations) ──
  if (/\b(scale|scaling)\b/i.test(queryLower)) {
    hypotheses.push('Technical scaling (infrastructure, performance, load)');
    hypotheses.push('Business scaling (revenue, team, market expansion)');
    hypotheses.push('Operational scaling (processes, automation, efficiency)');
  }
  if (/\b(optimize|improve|enhance)\b/i.test(queryLower)) {
    hypotheses.push('Performance optimization (speed, efficiency)');
    hypotheses.push('Cost optimization (reduce spending)');
    hypotheses.push('Quality optimization (better output, fewer errors)');
  }
  if (/\b(best|recommend|choose|pick|select)\b/i.test(queryLower)) {
    hypotheses.push('Best for the user\'s specific use case and constraints');
    hypotheses.push('Best in general / industry standard');
    hypotheses.push('Best for cost-effectiveness');
  }
  if (/\b(build|create|make|develop)\b/i.test(queryLower) && taskType !== 'creative') {
    hypotheses.push('Build from scratch vs. use existing tools/frameworks');
    hypotheses.push('MVP approach vs. production-grade');
  }
  if (/\b(fix|solve|resolve|debug)\b/i.test(queryLower)) {
    hypotheses.push('Quick fix vs. root cause analysis');
    hypotheses.push('Workaround vs. proper solution');
  }

  // ── Document context: always proceed (user uploaded a file) ──
  if (hasDocumentContext) {
    return { needsClarification: false, confidenceScore: 0.9, depthLevel: 'deep', taskType, reasons: ['document context provided'], hypotheses };
  }

  // ── Follow-up in conversation: relaxed requirements ──
  if (hasConversationContext && wordCount >= 3) {
    return { needsClarification: false, confidenceScore: 0.85, depthLevel, taskType, reasons: ['follow-up with conversation context'], hypotheses };
  }

  // ── Confidence scoring ──

  // Very short standalone queries
  if (wordCount < 5 && !hasConversationContext) {
    confidence -= 0.3;
    reasons.push('query is very short — may need more detail');
  } else if (wordCount < 10 && !hasConversationContext) {
    confidence -= 0.1;
  }

  // Vague action words without specific target
  const VAGUE_PATTERNS = [
    { pattern: /^(optimize|improve|fix|enhance|update|change|make better)\b/i, reason: 'vague action — what specifically should be optimized/improved?' },
    { pattern: /^(help me|help with|I need help)\b/i, reason: 'request for help without specific problem statement' },
    { pattern: /^(tell me about|what about|how about)\b/i, reason: 'open-ended question — could be more specific' },
  ];

  for (const { pattern, reason } of VAGUE_PATTERNS) {
    if (pattern.test(query)) {
      confidence -= 0.2;
      reasons.push(reason);
    }
  }

  // Broad scope
  if (/\b(everything|all|complete|full|entire)\b/i.test(query) && wordCount < 15) {
    confidence -= 0.15;
    reasons.push('broad scope — may need to narrow down');
  }

  // Missing constraints for coding
  if (taskType === 'coding' && !/\b(python|javascript|typescript|java|rust|go|react|node|express|sql|html|css|c\+\+|c#|swift|kotlin|php|ruby)\b/i.test(query)) {
    confidence -= 0.1;
    reasons.push('no programming language or framework specified');
  }

  // Boosters
  if (wordCount >= 20) confidence += 0.1;
  if (/\?$/.test(query.trim())) confidence += 0.05;
  if (/\b(specifically|exactly|precisely|in particular)\b/i.test(query)) confidence += 0.1;
  if (/```/.test(query)) confidence += 0.15;
  if (wordCount >= 40) confidence += 0.1; // very detailed query

  confidence = Math.max(0, Math.min(1, confidence));

  const needsClarification = confidence < 0.6 && !hasConversationContext;

  if (needsClarification) {
    logger.info(`Deep research: needs clarification (confidence=${confidence.toFixed(2)}): "${query.substring(0, 80)}"`);
  } else {
    logger.info(`Deep research: depth=${depthLevel}, task=${taskType}, confidence=${confidence.toFixed(2)}, hypotheses=${hypotheses.length}`);
  }

  return { needsClarification, confidenceScore: confidence, depthLevel, taskType, reasons, hypotheses };
}

// ── Stage 2: Clarification System Prompt ─────────────────────────────

export function getClarificationSystemPrompt(analysis: QueryAnalysis): string {
  const reasonsList = analysis.reasons.map(r => `- ${r}`).join('\n');
  const hypothesesList = analysis.hypotheses.length > 0
    ? `\nPOSSIBLE INTERPRETATIONS I DETECTED:\n${analysis.hypotheses.map(h => `- ${h}`).join('\n')}\n`
    : '';

  return `You are a senior expert consultant. The user's query needs clarification before you can provide a precise, high-quality answer.

DETECTED ISSUES:
${reasonsList}
${hypothesesList}
YOUR TASK:
1. Briefly acknowledge what you think they're asking about
2. If you detected multiple possible interpretations, mention them
3. Ask 2–4 specific, targeted questions that will let you give a much better answer
4. Questions must directly address the gaps — NOT generic questions like "what is your goal?"

FORMAT:
Start with: "I want to make sure I give you exactly what you need."
Then explain possible interpretations if relevant.
Then list your questions numbered 1-4.
End with: "Once you answer these, I'll provide a thorough, expert-level response."`;
}

// ── Stage 3: Deep Research Prompt (Pass 1) ───────────────────────────

/**
 * Build the deep research system prompt for Pass 1.
 * Combines hypothesis building + multi-angle reasoning.
 * Tailored by task type.
 */
export function getDeepResearchPrompt(analysis: QueryAnalysis): string {
  const hypothesesSection = analysis.hypotheses.length > 0
    ? `\nPOSSIBLE INTERPRETATIONS TO CONSIDER:\n${analysis.hypotheses.map((h, i) => `${i + 1}. ${h}`).join('\n')}\nAddress the most likely interpretation, but note if others apply.\n`
    : '';

  const BASE = `You are an expert researcher and consultant operating in DEEP RESEARCH MODE.

Your task is to research this problem like a human expert would — not just answer it.
${hypothesesSection}
RESEARCH PROCESS (follow this exactly):

## 1. PROBLEM UNDERSTANDING
- Restate the core problem in your own words
- Identify what's actually being asked vs. what they might really need
- Note any ambiguity and how you're interpreting it

## 2. KEY ASSUMPTIONS
- List assumptions you're making
- Flag anything that depends on context you don't have

## 3. MULTI-ANGLE ANALYSIS
Analyze from EVERY relevant angle:`;

  const ANGLE_MAP: Record<TaskType, string> = {
    coding: `
- **Technical**: Architecture, implementation approach, code quality
- **Performance**: Time/space complexity, bottlenecks, optimization opportunities
- **Security**: Attack vectors, input validation, authentication/authorization
- **Maintainability**: Code structure, testing strategy, documentation needs
- **Alternatives**: Other approaches, libraries, or patterns that could work`,

    strategic: `
- **Market**: Competitive landscape, positioning, timing, market size
- **Business Model**: Revenue streams, unit economics, pricing strategy
- **Execution**: Team requirements, timeline, milestones, resource allocation
- **Risk**: What could go wrong, mitigation strategies, worst-case scenarios
- **Growth**: Scaling path, customer acquisition, retention strategy`,

    analytical: `
- **Quantitative**: Numbers, metrics, benchmarks, data-driven insights
- **Qualitative**: User experience, strategic fit, organizational impact
- **Comparative**: How alternatives stack up against each other
- **Temporal**: Short-term vs. long-term implications
- **Risk/Reward**: Trade-offs, downside risks, upside potential`,

    research: `
- **Foundational**: Core concepts and principles
- **Current State**: Latest developments and consensus
- **Debates**: Areas of disagreement or open questions
- **Practical**: Real-world applications and implications
- **Future**: Where this is heading, emerging trends`,

    factual: `
- **Core Answer**: The direct, accurate answer
- **Context**: Why this matters, background
- **Nuances**: Edge cases, exceptions, common misconceptions
- **Related**: Connected topics worth knowing about`,

    creative: `
- **Strategic**: Why each approach works, target audience alignment
- **Execution**: Specific, usable content (not just outlines)
- **Differentiation**: What makes this stand out from generic versions
- **Iteration**: 2-3 distinct directions with different strengths`,

    general: `
- **Primary**: The most direct and relevant analysis
- **Alternative**: A different way to think about the problem
- **Practical**: Real-world considerations and constraints
- **Meta**: What the user might not have considered`,
  };

  const CLOSING = `

## 4. SYNTHESIS
- Combine insights from all angles into a coherent answer
- Prioritize what matters most
- Be specific — no generic advice

RULES:
- Think step-by-step, don't jump to conclusions
- Every claim must have reasoning behind it
- If you're uncertain, say so and explain why
- Prefer depth over breadth — better to be thorough on key points than shallow on many
- Include concrete examples, numbers, or code where relevant`;

  return BASE + (ANGLE_MAP[analysis.taskType] || ANGLE_MAP.general) + CLOSING;
}

// ── Stage 4: Iterative Refinement (Pass 2) ───────────────────────────

/**
 * Build the self-critique + refinement prompt for Pass 2.
 * Takes Pass 1 research output and produces the polished final answer.
 */
export function buildRefinementPrompt(researchOutput: string, originalQuery: string): string {
  return `You are a senior expert reviewer and editor. You've received deep research on a user's question. Your job is to transform it into the BEST possible answer.

ORIGINAL QUESTION:
${originalQuery}

DEEP RESEARCH (from analysis phase):
${researchOutput}

─── SELF-CRITIQUE CHECKLIST (apply before writing) ───
□ Is anything GENERIC that should be SPECIFIC? → Fix it
□ Is anything MISSING that the user would need? → Add it
□ Is anything WRONG or poorly reasoned? → Correct it
□ Is anything REDUNDANT? → Cut it
□ Is every recommendation ACTIONABLE? → Make it concrete
□ Would an expert in this field be satisfied with this? → If not, improve it

─── OUTPUT FORMAT (follow this structure) ───

### Understanding
[One clear sentence showing you understand exactly what they need]

### Key Assumptions
[List any assumptions — skip this section if none]

### Analysis
[The deep, multi-angle analysis — organized with clear headers]
[Use tables for comparisons, bullet points for lists, code blocks for code]
[Every point must be specific and backed by reasoning]

### Recommendation
[Clear, actionable final answer — what they should DO]
[Include specific steps, tools, numbers, or code]

### Go Deeper?
[One line suggesting 1-2 specific areas you could explore further]

─── RULES ───
- Output ONLY the polished answer in the format above
- Do NOT reference "the research above" or "the analysis phase"
- Do NOT start with "Here's my analysis" — just start with ### Understanding
- Be thorough but concise — every sentence must earn its place
- Use markdown formatting throughout
- Sound like a senior consultant delivering a report, not a chatbot answering a question`;
}
