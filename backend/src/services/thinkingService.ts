/**
 * Deep Research Service — 4-Stage Expert Research Pipeline
 *
 * Simulates how a senior human expert researches a problem:
 *
 * Stage 1: Intent + Depth Detection (instant, rule-based)
 * Stage 2: Clarification (if query is vague — ask BEFORE answering)
 * Stage 3: Deep Research — Hypothesis + Multi-Angle Reasoning (Pass 1, non-streaming)
 * Stage 4: Iterative Refinement — Self-Critique + Polish (Pass 2, streaming)
 *
 * The AI should feel like a consultant, researcher, and strategist — not a chatbot.
 */

import logger from '../config/logger.js';

// ── Types ────────────────────────────────────────────────────────────

export type DepthLevel = 'surface' | 'deep' | 'research';
export type TaskType = 'factual' | 'analytical' | 'research' | 'coding' | 'creative' | 'strategic' | 'troubleshooting' | 'general';

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
 * - What kind of task is it? (factual, analytical, research, coding, creative, strategic, troubleshooting)
 * - How deep should we go? (surface, deep, research)
 * - Is clarification needed? (confidence too low)
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
  const userMessages = messageHistory.filter(m => m.role === 'user');
  const hasConversationContext = userMessages.length > 1;
  const hasDocumentContext = query.includes('Here is the attached document content:');
  const queryLower = query.toLowerCase();

  // ── Task type detection ──
  let taskType: TaskType = 'general';

  if (/\b(code|function|class|api|bug|error|debug|implement|refactor|regex|sql|query|script|deploy|docker|git|build|compile|test|migrate|npm|pip|webpack|vite)\b/i.test(query)) {
    taskType = 'coding';
  } else if (/\b(fix|solve|resolve|not working|broken|issue|problem|crash|fail|stuck|troubleshoot|diagnose)\b/i.test(query)) {
    taskType = 'troubleshooting';
  } else if (/\b(strategy|scale|grow|monetize|pricing|positioning|market|compete|business model|roadmap|launch|pivot|hire|fundrais|revenue|profit|expansion)\b/i.test(query)) {
    taskType = 'strategic';
  } else if (/\b(analyze|compare|evaluate|assess|benchmark|audit|review|performance|metrics|data|statistics|trend|trade-?off|pros|cons|impact|roi)\b/i.test(query)) {
    taskType = 'analytical';
  } else if (/\b(research|investigate|find out|explore|study|deep dive|how does|how do|why does|why do|explain.*work|explain.*mechanism|understand)\b/i.test(query)) {
    taskType = 'research';
  } else if (/\b(what is|who is|when did|where is|define|meaning of)\b/i.test(query) && wordCount < 15) {
    taskType = 'factual';
  } else if (/\b(write|create|draft|design|brainstorm|generate|story|poem|content|marketing|email|blog|copy|outline|template)\b/i.test(query)) {
    taskType = 'creative';
  }

  // ── Depth level detection ──
  let depthLevel: DepthLevel = 'deep'; // default for thinking mode

  // Surface: simple factual queries with short input
  if (taskType === 'factual' && wordCount < 10) {
    depthLevel = 'surface';
  }

  // Research: complex multi-faceted problems
  const RESEARCH_SIGNALS = [
    /\b(how (to|should|can|do I)|best (way|approach|practice|strategy|method))\b/i,
    /\b(compare|versus|vs|trade-?off|alternative|which is better|difference between)\b/i,
    /\b(architecture|design|system|infrastructure|scale|optimize|strategy|plan|framework)\b/i,
    /\b(why (is|are|does|do|should|would)|what causes|root cause|reason for)\b/i,
    /\b(comprehensive|in-?depth|detailed|thorough|complete|full|everything about)\b/i,
    /\b(step.by.step|walkthrough|guide|tutorial|explain in detail)\b/i,
    /\b(consider|evaluate|weigh|decision|choose between|recommend)\b/i,
  ];
  const researchSignalCount = RESEARCH_SIGNALS.filter(p => p.test(query)).length;
  if (researchSignalCount >= 2 || (researchSignalCount >= 1 && wordCount >= 15)) {
    depthLevel = 'research';
  }
  if (taskType === 'strategic' || taskType === 'troubleshooting') depthLevel = 'research';

  // Long queries (40+ words) always get research depth
  if (wordCount >= 40) depthLevel = 'research';

  // ── Hypothesis building (possible interpretations) ──
  if (/\b(scale|scaling)\b/i.test(queryLower)) {
    hypotheses.push('Technical scaling (infrastructure, performance, load handling)');
    hypotheses.push('Business scaling (revenue, team, market expansion)');
    hypotheses.push('Operational scaling (processes, automation, efficiency)');
  }
  if (/\b(optimize|improve|enhance|better)\b/i.test(queryLower)) {
    hypotheses.push('Performance optimization (speed, latency, throughput)');
    hypotheses.push('Cost optimization (reduce spending, better ROI)');
    hypotheses.push('Quality optimization (accuracy, reliability, UX)');
  }
  if (/\b(best|recommend|choose|pick|select|which)\b/i.test(queryLower)) {
    hypotheses.push('Best for the user\'s specific constraints and context');
    hypotheses.push('Best in general / industry standard choice');
    hypotheses.push('Best for cost-effectiveness and practicality');
  }
  if (/\b(build|create|make|develop|implement)\b/i.test(queryLower) && taskType !== 'creative') {
    hypotheses.push('Build from scratch vs. use existing tools/frameworks');
    hypotheses.push('MVP / prototype approach vs. production-grade');
    hypotheses.push('Solo developer vs. team implementation');
  }
  if (/\b(fix|solve|resolve|debug|troubleshoot)\b/i.test(queryLower)) {
    hypotheses.push('Quick fix / workaround vs. proper root cause solution');
    hypotheses.push('Configuration issue vs. code/logic bug');
    hypotheses.push('Environment-specific vs. universal problem');
  }
  if (/\b(security|secure|protect|vulnerable|attack|hack)\b/i.test(queryLower)) {
    hypotheses.push('Application-level security (auth, input validation, XSS)');
    hypotheses.push('Infrastructure security (network, firewall, encryption)');
    hypotheses.push('Data security (PII, compliance, access control)');
  }
  if (/\b(cost|price|pricing|expensive|cheap|budget|afford)\b/i.test(queryLower)) {
    hypotheses.push('Upfront cost vs. total cost of ownership');
    hypotheses.push('Cost reduction strategies');
    hypotheses.push('Value-based pricing vs. competitive pricing');
  }

  // ── Document context: still analyze depth, but don't ask clarification ──
  if (hasDocumentContext) {
    return { needsClarification: false, confidenceScore: 0.9, depthLevel: Math.max(depthLevel === 'surface' ? 0 : depthLevel === 'deep' ? 1 : 2, 1) === 2 ? 'research' : 'deep' as DepthLevel, taskType, reasons: ['document context provided'], hypotheses };
  }

  // ── Confidence scoring ──

  // Very short standalone queries — high chance of ambiguity
  if (wordCount < 4 && !hasConversationContext) {
    confidence -= 0.35;
    reasons.push('query is very short — likely needs more context');
  } else if (wordCount < 5 && !hasConversationContext) {
    confidence -= 0.25;
    reasons.push('query is short — may need more detail');
  } else if (wordCount < 8 && !hasConversationContext) {
    confidence -= 0.1;
  }

  // Short queries even IN conversation context
  if (wordCount < 4 && hasConversationContext) {
    confidence -= 0.15;
    reasons.push('very short follow-up — may need clarification on what aspect to address');
  }

  // Vague action words without specific target
  const VAGUE_PATTERNS = [
    { pattern: /^(optimize|improve|fix|enhance|update|change|make better)\b/i, penalty: 0.25, reason: 'vague action — what specifically should be optimized/improved?' },
    { pattern: /^(help me|help with|I need help)\b/i, penalty: 0.2, reason: 'request for help without specific problem statement' },
    { pattern: /^(tell me about|what about|how about)\b/i, penalty: 0.15, reason: 'open-ended question — could benefit from focus' },
    { pattern: /^(do|can you|is it possible|should I)\b/i, penalty: 0.1, reason: 'yes/no question that likely needs deeper exploration' },
  ];

  for (const { pattern, penalty, reason } of VAGUE_PATTERNS) {
    if (pattern.test(query)) {
      confidence -= penalty;
      reasons.push(reason);
    }
  }

  // Broad scope without specifics
  if (/\b(everything|all|complete|full|entire|whole)\b/i.test(query) && wordCount < 15) {
    confidence -= 0.15;
    reasons.push('very broad scope — narrowing would improve answer quality');
  }

  // Missing constraints for coding
  if (taskType === 'coding' && !/\b(python|javascript|typescript|java|rust|go|react|node|express|sql|html|css|c\+\+|c#|swift|kotlin|php|ruby|vue|angular|next|django|flask|spring|laravel)\b/i.test(query)) {
    confidence -= 0.1;
    reasons.push('no programming language or framework specified');
  }

  // Missing context for troubleshooting
  if (taskType === 'troubleshooting' && wordCount < 15 && !/```/.test(query)) {
    confidence -= 0.15;
    reasons.push('troubleshooting without error message or code context');
  }

  // Boosters — specific, detailed queries increase confidence
  if (wordCount >= 20) confidence += 0.1;
  if (wordCount >= 40) confidence += 0.1;
  if (/\?$/.test(query.trim())) confidence += 0.05;
  if (/\b(specifically|exactly|precisely|in particular)\b/i.test(query)) confidence += 0.1;
  if (/```/.test(query)) confidence += 0.15; // code block = specific context
  if (/\b(because|since|given that|context|background)\b/i.test(query)) confidence += 0.1; // provides reasoning

  confidence = Math.max(0, Math.min(1, confidence));

  // Clarification threshold: trigger if confidence is low
  // Allow clarification even in conversations if the query is very vague (< 0.5)
  const needsClarification = hasConversationContext
    ? confidence < 0.5 && wordCount < 5  // stricter in conversations — only for very vague follow-ups
    : confidence < 0.65;                  // standalone queries — broader threshold

  if (needsClarification) {
    logger.info(`Think mode: needs clarification (confidence=${confidence.toFixed(2)}): "${query.substring(0, 80)}"`);
  } else {
    logger.info(`Think mode: depth=${depthLevel}, task=${taskType}, confidence=${confidence.toFixed(2)}, hypotheses=${hypotheses.length}`);
  }

  return { needsClarification, confidenceScore: confidence, depthLevel, taskType, reasons, hypotheses };
}

// ── Stage 2: Clarification System Prompt ─────────────────────────────

export function getClarificationSystemPrompt(analysis: QueryAnalysis): string {
  const reasonsList = analysis.reasons.map(r => `• ${r}`).join('\n');
  const hypothesesList = analysis.hypotheses.length > 0
    ? `\nI've identified these possible interpretations:\n${analysis.hypotheses.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n`
    : '';

  return `You are a premium AI consultant on the ConvoiaAI platform operating in THINK MODE.

The user's query needs clarification before you can deliver a truly expert-level answer. Think mode is about DEPTH and PRECISION — it's better to ask smart questions than to guess and give a generic answer.

ANALYSIS OF THE QUERY:
${reasonsList}
${hypothesesList}
YOUR APPROACH:
1. Acknowledge their topic — show you understand the general direction
2. If you identified multiple interpretations, briefly mention the 2–3 most likely ones
3. Ask 2–3 targeted, specific questions that will dramatically improve your answer
4. Each question should address a real gap — not generic filler like "what is your goal?"

QUESTION QUALITY RULES:
- Questions must be SPECIFIC to their domain and query
- Frame questions as "This vs. That" choices when possible (easier for user to answer)
- Include context about WHY you're asking (helps user understand the value)

TONE:
- Confident and expert — like a senior consultant scoping a project
- Warm but direct — no robotic formality
- Show genuine intellectual curiosity about their problem

FORMAT:
- Start with a brief acknowledgment (1-2 sentences about what you think they're exploring)
- Present possible interpretations if relevant (numbered list)
- Ask your 2-3 questions (numbered, each with a brief "why I'm asking" context)
- Close with confidence: "With these details, I'll provide a thorough, expert-level analysis."

DO NOT:
- Give a generic answer alongside the questions
- Ask more than 3 questions (respect their time)
- Use formulaic phrases like "I'd be happy to help" or "Great question"`;
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

  const BASE = `You are an expert researcher operating in DEEP THINK MODE on the ConvoiaAI platform.

Your task: research this problem the way a senior expert would — not just answer it, but UNDERSTAND it from multiple angles before forming a conclusion.
${hypothesesSection}
RESEARCH PROCESS (follow this structure):

## 1. PROBLEM DECOMPOSITION
- Restate the core problem in your own words
- Break it into sub-problems or components
- Identify what's actually being asked vs. what they might REALLY need (the question behind the question)
- Note any ambiguity and state how you're interpreting it

## 2. KEY ASSUMPTIONS & CONSTRAINTS
- List assumptions you're making explicitly
- Identify constraints (time, budget, technical, organizational)
- Flag anything that depends on context you don't have

## 3. MULTI-ANGLE ANALYSIS`;

  const ANGLE_MAP: Record<TaskType, string> = {
    coding: `
Analyze from EVERY relevant angle:
- **Architecture**: Design patterns, component structure, data flow, separation of concerns
- **Implementation**: Approach, algorithm choice, language/framework considerations
- **Performance**: Time/space complexity, bottlenecks, optimization opportunities, caching
- **Security**: Attack vectors, input validation, auth, data exposure risks
- **Maintainability**: Code structure, testing strategy, documentation, future extensibility
- **Alternatives**: Other approaches, libraries, or patterns that could solve this differently
- **Edge Cases**: What could break? Null values, race conditions, scale limits`,

    troubleshooting: `
Diagnose systematically:
- **Symptoms vs. Root Cause**: What they're seeing vs. what's actually wrong
- **Isolation**: Narrow down where the problem occurs (layer, component, timing)
- **Common Causes**: Most frequent reasons for this type of issue
- **Uncommon Causes**: Less obvious but possible explanations
- **Dependencies**: External systems, versions, configurations that could be involved
- **Verification**: How to confirm which cause is correct before fixing
- **Prevention**: How to prevent recurrence after fixing`,

    strategic: `
Analyze from EVERY relevant angle:
- **Market & Positioning**: Competitive landscape, timing, market size, differentiation
- **Business Model**: Revenue streams, unit economics, pricing, margins
- **Execution**: Team requirements, timeline, milestones, resource allocation, dependencies
- **Risk Assessment**: What could go wrong (quantified where possible), mitigation strategies
- **Growth Path**: Scaling strategy, customer acquisition, retention, network effects
- **Financial**: Revenue projections, break-even, funding requirements, burn rate`,

    analytical: `
Analyze from EVERY relevant angle:
- **Quantitative**: Numbers, metrics, benchmarks, data-driven insights, statistical significance
- **Qualitative**: User experience, strategic fit, organizational/cultural impact
- **Comparative**: How alternatives stack up — use a framework (weighted scoring, decision matrix)
- **Temporal**: Short-term vs. long-term implications, time-value considerations
- **Risk/Reward**: Trade-offs quantified, downside exposure, upside potential, expected value
- **Second-Order Effects**: Consequences of consequences — what happens AFTER the decision`,

    research: `
Research from EVERY relevant angle:
- **Foundational**: Core concepts, principles, and mental models
- **Current State**: Latest developments, consensus view, recent breakthroughs
- **Debates & Open Questions**: Areas of disagreement, unresolved tensions
- **Practical Applications**: Real-world use cases, implementation considerations
- **Evidence Quality**: How strong is the evidence? Consensus vs. emerging vs. speculative
- **Future Direction**: Where this is heading, emerging trends, paradigm shifts`,

    factual: `
Verify and contextualize:
- **Core Answer**: The direct, accurate, verified answer
- **Context**: Why this matters, historical background, significance
- **Nuances**: Edge cases, exceptions, common misconceptions to correct
- **Related Knowledge**: Connected topics that deepen understanding
- **Practical Relevance**: How this applies to real-world situations`,

    creative: `
Explore from multiple creative angles:
- **Strategic Alignment**: Why each approach works for the target audience and goals
- **Execution Quality**: Specific, usable output (not just outlines or placeholders)
- **Differentiation**: What makes this stand out from generic, AI-generated content
- **Multiple Directions**: 2-3 distinct creative approaches with different strengths
- **Refinement Opportunities**: How each direction could be iterated and improved
- **Audience Psychology**: What resonates emotionally and drives the desired action`,

    general: `
Analyze from multiple perspectives:
- **Primary Analysis**: The most direct and relevant examination of the question
- **Alternative Perspective**: A contrarian or different way to think about the problem
- **Practical Considerations**: Real-world constraints, implementation challenges
- **Blind Spots**: What the user might not have considered but should
- **Cross-Domain Insights**: Lessons from other fields that apply here`,
  };

  const CLOSING = `

## 4. SYNTHESIS & PRELIMINARY CONCLUSION
- Combine insights from all angles into a coherent thesis
- Rank factors by importance — what matters most?
- State your preliminary recommendation with confidence level
- Note what would change your recommendation (sensitivity analysis)

RESEARCH RULES:
- Think step-by-step — don't jump to conclusions
- Every claim must have reasoning behind it, not just assertion
- If you're uncertain about something, say so explicitly and explain why
- Prefer depth over breadth — better to be thorough on 3 key points than shallow on 10
- Include concrete examples, numbers, comparisons, or code where relevant
- Challenge your own assumptions — look for holes in your reasoning
- This is a RESEARCH document — be rigorous, not conversational`;

  return BASE + (ANGLE_MAP[analysis.taskType] || ANGLE_MAP.general) + CLOSING;
}

// ── Stage 4: Iterative Refinement (Pass 2) ───────────────────────────

/**
 * Build the self-critique + refinement prompt for Pass 2.
 * Takes Pass 1 research output and produces the polished final answer.
 */
export function buildRefinementPrompt(researchOutput: string, originalQuery: string): string {
  return `You completed a deep research phase on the user's question. Now transform that research into a PREMIUM, consultant-grade response.

═══ ORIGINAL QUESTION ═══
${originalQuery}

═══ YOUR RESEARCH (from analysis phase) ═══
${researchOutput}

═══ SELF-CRITIQUE CHECKLIST (apply before writing) ═══
□ Is anything GENERIC that should be SPECIFIC? → Replace with concrete details
□ Is anything MISSING that the user would need? → Add it
□ Is anything WRONG or weakly reasoned? → Correct it with stronger logic
□ Is anything REDUNDANT or bloated? → Cut mercilessly
□ Is every recommendation ACTIONABLE? → Include specific steps, tools, or code
□ Would an expert in this field respect this answer? → If not, elevate it
□ Does this go BEYOND what a free AI tool would give? → It must

═══ OUTPUT FORMAT (follow this structure) ═══

### Understanding
[1-2 sentences showing you deeply understand what they need and WHY they need it — not just restating the question]

### Analysis
[The deep, multi-angle analysis — organized with clear subheaders]
[Use tables for comparisons, bullet points for lists, code blocks for code]
[Every point must be specific and backed by reasoning]
[Include concrete examples, numbers, or references]

### Recommendation
[Clear, decisive, actionable answer — what they should DO]
[Include specific steps, tools, numbers, timelines, or code]
[If there are multiple valid paths, rank them with clear reasoning]

### Key Takeaway
[One powerful sentence that captures the essential insight — something they'll remember]

### What would you like to explore deeper?
[Ask 1-2 specific, intelligent follow-up questions that probe deeper into their situation]
[These should feel like a senior consultant probing for the next phase of work]
[Example: "Are you optimizing for speed-to-market or long-term scalability? That changes the architecture significantly."]

═══ RULES ═══
- Output ONLY the polished answer in the format above
- Do NOT reference "the research" or "the analysis phase" — present as your direct expert answer
- Do NOT start with filler ("Here's my analysis", "Let me break this down") — jump straight into ### Understanding
- Be thorough but concise — every sentence must earn its place
- Sound like a senior consultant delivering a high-value report
- Use markdown formatting throughout (bold, headers, tables, code blocks)
- The follow-up questions are MANDATORY — they drive the conversation forward
- Show genuine expertise — go beyond surface-level advice`;
}
