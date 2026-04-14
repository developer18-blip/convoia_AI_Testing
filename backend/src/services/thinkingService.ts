/**
 * Deep Research Service — AI-Powered Expert Research Pipeline
 *
 * Hybrid approach: fast rule-based pre-screen + AI-powered deep analysis.
 *
 * Stage 1: Intent + Depth Detection (rule-based pre-screen + AI classifier)
 * Stage 2: Clarification (model-aware, hypothesis-driven questions)
 * Stage 3: Deep Research — model-aware reasoning styles (Pass 1, non-streaming)
 * Stage 4: Iterative Refinement — model-aware output polish (Pass 2, streaming)
 */

import axios from 'axios';
import logger from '../config/logger.js';
import { getModelIntelligence } from '../ai/modelRegistry.js';

// ── Types ────────────────────────────────────────────────────────────

export type DepthLevel = 'surface' | 'deep' | 'research';
export type TaskType = 'factual' | 'analytical' | 'research' | 'coding' | 'creative' | 'strategic' | 'troubleshooting' | 'general';

export interface QueryAnalysis {
  needsClarification: boolean;
  confidenceScore: number;
  depthLevel: DepthLevel;
  taskType: TaskType;
  reasons: string[];
  hypotheses: string[];
  ambiguities?: string[];
}

// ── Stage 1: Intent + Depth Detection ────────────────────────────────

/**
 * Analyze a user query with hybrid rule-based + AI-powered classification.
 *
 * Phase A: Fast rule-based pre-screen (instant, free)
 * Phase B: AI classifier for ambiguous cases (fast model call)
 * Phase C: Model-aware depth adjustment
 */
export async function analyzeQuery(
  query: string,
  messageHistory: Array<{ role: string; content: any }>,
  modelId?: string,
  apiKey?: string,
  fastModelId?: string
): Promise<QueryAnalysis> {
  // ── PHASE A: Rule-based pre-screen ──

  const ruleResult = ruleBasedAnalysis(query, messageHistory);

  // Fast exits — skip AI classifier to save cost
  const wordCount = query.trim().split(/\s+/).length;
  const hasDocumentContext = query.includes('Here is the attached document content:');

  if (ruleResult.confidenceScore > 0.85 && wordCount > 15) {
    logger.info(`Think mode (rule-based, high confidence): depth=${ruleResult.depthLevel}, task=${ruleResult.taskType}, confidence=${ruleResult.confidenceScore.toFixed(2)}`);
    return ruleResult;
  }
  if (hasDocumentContext) {
    return ruleResult;
  }
  if (ruleResult.taskType === 'factual' && wordCount < 10) {
    ruleResult.depthLevel = 'surface';
    ruleResult.needsClarification = false;
    return ruleResult;
  }

  // ── PHASE B: AI-powered analysis for ambiguous cases ──

  if (apiKey && (ruleResult.confidenceScore >= 0.4 && ruleResult.confidenceScore <= 0.85 || wordCount < 12)) {
    try {
      const aiResult = await runAIClassifier(query, messageHistory, apiKey, fastModelId || 'gpt-5.4-nano');

      // Merge: AI takes precedence for key fields
      if (aiResult) {
        ruleResult.needsClarification = aiResult.needsClarification;
        ruleResult.depthLevel = aiResult.depthLevel;
        if (aiResult.taskType !== 'general') ruleResult.taskType = aiResult.taskType;
        ruleResult.confidenceScore = aiResult.confidenceScore;
        ruleResult.ambiguities = aiResult.ambiguities || [];

        // Merge hypotheses (deduplicate)
        const existing = new Set(ruleResult.hypotheses.map(h => h.toLowerCase()));
        for (const h of aiResult.hypotheses) {
          if (!existing.has(h.toLowerCase())) {
            ruleResult.hypotheses.push(h);
          }
        }

        if (aiResult.clarificationReason) {
          ruleResult.reasons.push(aiResult.clarificationReason);
        }
      }
    } catch (err: any) {
      logger.warn(`AI classifier failed, using rule-based result: ${err.message}`);
      // Fall through to rule-based result
    }
  }

  // ── PHASE C: Model-aware depth adjustment ──

  const intel = modelId ? getModelIntelligence(modelId) : null;

  if (intel) {
    // Only elevate to research when the query ALSO has research signals.
    // Previously every flagship reasoning model was blindly upgraded from
    // deep → research, which over-escalated simple think-mode queries and
    // burned thinking tokens unnecessarily.
    if (intel.tier === 'flagship' && intel.isReasoningModel && ruleResult.depthLevel === 'deep') {
      const wc = query.trim().split(/\s+/).length;
      const hasResearchSignals = wc >= 20 ||
        /\b(comprehensive|in-depth|thorough|detailed|compare|trade-?off|strategy|architecture)\b/i.test(query);
      if (hasResearchSignals) {
        ruleResult.depthLevel = 'research';
        ruleResult.reasons.push(`${intel.displayName} is a flagship reasoning model + query has research signals — elevated to research depth`);
      }
    }
    if (intel.tier === 'fast' && ruleResult.depthLevel === 'research') {
      ruleResult.depthLevel = 'deep';
      ruleResult.reasons.push(`${intel.displayName} capped at deep mode for quality`);
    }
  }

  logger.info(`Think mode (hybrid): depth=${ruleResult.depthLevel}, task=${ruleResult.taskType}, confidence=${ruleResult.confidenceScore.toFixed(2)}, hypotheses=${ruleResult.hypotheses.length}, clarify=${ruleResult.needsClarification}`);

  return ruleResult;
}

// ── Rule-based analysis (Phase A internals) ──────────────────────────

function ruleBasedAnalysis(
  query: string,
  messageHistory: Array<{ role: string; content: any }>
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
  let depthLevel: DepthLevel = 'deep';

  if (taskType === 'factual' && wordCount < 10) depthLevel = 'surface';

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
  if (researchSignalCount >= 2 || (researchSignalCount >= 1 && wordCount >= 15)) depthLevel = 'research';
  if (taskType === 'strategic' || taskType === 'troubleshooting') depthLevel = 'research';
  if (wordCount >= 40) depthLevel = 'research';

  // ── Hypothesis building ──
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
  }
  if (/\b(fix|solve|resolve|debug|troubleshoot)\b/i.test(queryLower)) {
    hypotheses.push('Quick fix / workaround vs. proper root cause solution');
    hypotheses.push('Configuration issue vs. code/logic bug');
  }
  if (/\b(security|secure|protect|vulnerable)\b/i.test(queryLower)) {
    hypotheses.push('Application-level security (auth, input validation, XSS)');
    hypotheses.push('Infrastructure security (network, firewall, encryption)');
  }
  if (/\b(cost|price|pricing|expensive|cheap|budget)\b/i.test(queryLower)) {
    hypotheses.push('Upfront cost vs. total cost of ownership');
    hypotheses.push('Cost reduction strategies vs. value-based pricing');
  }

  // ── Document context: skip clarification ──
  if (hasDocumentContext) {
    return {
      needsClarification: false,
      confidenceScore: 0.9,
      depthLevel: depthLevel === 'surface' ? 'deep' : depthLevel,
      taskType,
      reasons: ['document context provided'],
      hypotheses,
    };
  }

  // ── Confidence scoring ──
  if (wordCount < 4 && !hasConversationContext) { confidence -= 0.35; reasons.push('query is very short — likely needs more context'); }
  else if (wordCount < 5 && !hasConversationContext) { confidence -= 0.25; reasons.push('query is short — may need more detail'); }
  else if (wordCount < 8 && !hasConversationContext) { confidence -= 0.1; }

  if (wordCount < 4 && hasConversationContext) {
    // Only penalize if the follow-up is truly ambiguous (no clear topic).
    // "what about pricing?" in an ongoing conversation is unambiguous —
    // the topic word carries the signal. Blanket penalty caused every
    // short follow-up to trip clarification unnecessarily.
    const hasTopicWord = /\b(price|pricing|cost|security|performance|scale|deploy|design|test|feature|bug|error|data|auth|api|ui|ux|mobile|backend|frontend|database|schema|model|prompt|token|cache|latency)\b/i.test(query);
    if (!hasTopicWord) {
      confidence -= 0.10;
      reasons.push('short follow-up without clear topic — may benefit from clarification');
    }
  }

  const VAGUE_PATTERNS = [
    { pattern: /^(optimize|improve|fix|enhance|update|change|make better)\b/i, penalty: 0.25, reason: 'vague action — what specifically should be optimized/improved?' },
    { pattern: /^(help me|help with|I need help)\b/i, penalty: 0.2, reason: 'request for help without specific problem statement' },
    { pattern: /^(tell me about|what about|how about)\b/i, penalty: 0.15, reason: 'open-ended question — could benefit from focus' },
    { pattern: /^(do|can you|is it possible|should I)\b/i, penalty: 0.1, reason: 'yes/no question that likely needs deeper exploration' },
  ];

  for (const { pattern, penalty, reason } of VAGUE_PATTERNS) {
    if (pattern.test(query)) { confidence -= penalty; reasons.push(reason); }
  }

  if (/\b(everything|all|complete|full|entire|whole)\b/i.test(query) && wordCount < 15) {
    confidence -= 0.15;
    reasons.push('very broad scope — narrowing would improve answer quality');
  }
  if (taskType === 'coding' && !/\b(python|javascript|typescript|java|rust|go|react|node|express|sql|html|css|c\+\+|c#|swift|kotlin|php|ruby|vue|angular|next|django|flask|spring|laravel)\b/i.test(query)) {
    confidence -= 0.1;
    reasons.push('no programming language or framework specified');
  }
  if (taskType === 'troubleshooting' && wordCount < 15 && !/```/.test(query)) {
    confidence -= 0.15;
    reasons.push('troubleshooting without error message or code context');
  }

  // Boosters
  if (wordCount >= 20) confidence += 0.1;
  if (wordCount >= 40) confidence += 0.1;
  if (/\?$/.test(query.trim())) confidence += 0.05;
  if (/\b(specifically|exactly|precisely|in particular)\b/i.test(query)) confidence += 0.1;
  if (/```/.test(query)) confidence += 0.15;
  if (/\b(because|since|given that|context|background)\b/i.test(query)) confidence += 0.1;

  confidence = Math.max(0, Math.min(1, confidence));

  // In active conversations we have more context, so clarify less often.
  // Outside conversations (first message), clarify when confidence is low.
  const needsClarification = hasConversationContext
    ? confidence < 0.4 && wordCount < 4
    : confidence < 0.65;

  return { needsClarification, confidenceScore: confidence, depthLevel, taskType, reasons, hypotheses };
}

// ── AI Classifier (Phase B) ──────────────────────────────────────────

async function runAIClassifier(
  query: string,
  messageHistory: Array<{ role: string; content: any }>,
  apiKey: string,
  fastModelId: string = 'gpt-5.4-nano'
): Promise<{
  needsClarification: boolean;
  clarificationReason: string | null;
  depthLevel: DepthLevel;
  taskType: TaskType;
  confidenceScore: number;
  hypotheses: string[];
  ambiguities: string[];
} | null> {
  const userTurns = messageHistory.filter(m => m.role === 'user').length;

  const CLASSIFIER_PROMPT = `You are a query analyzer for a deep AI research system.
Analyze this user query and respond with ONLY valid JSON, no markdown, no explanation.

Query: "${query}"

Conversation turns so far: ${userTurns}

Respond with exactly this JSON structure:
{
  "needsClarification": boolean,
  "clarificationReason": string or null,
  "depthLevel": "surface" | "deep" | "research",
  "taskType": "factual" | "analytical" | "research" | "coding" | "creative" | "strategic" | "troubleshooting" | "general",
  "confidenceScore": number between 0 and 1,
  "hypotheses": string[],
  "ambiguities": string[]
}

Rules for needsClarification:
- true ONLY if the answer would be FUNDAMENTALLY DIFFERENT based on missing info
- true if there are 2+ plausible interpretations with very different solutions
- false if you can make reasonable assumptions and still give a great answer
- false if the conversation history already provides enough context
- false for simple factual questions

Rules for depthLevel:
- "surface": simple fact, definition, quick answer
- "deep": requires analysis but direction is clear
- "research": multi-faceted, competing approaches, requires expert synthesis

Rules for hypotheses:
- List 2-4 specific, distinct interpretations of what user might want
- Each hypothesis should be actionable — different enough to warrant different answers
- Empty array if query is unambiguous`;

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: fastModelId,
      messages: [{ role: 'user', content: CLASSIFIER_PROMPT }],
      max_tokens: 400,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 8000,
    }
  );

  const text = response.data.choices?.[0]?.message?.content;
  if (!text) return null;

  const parsed = JSON.parse(text);

  // Validate and normalize
  const validDepths: DepthLevel[] = ['surface', 'deep', 'research'];
  const validTasks: TaskType[] = ['factual', 'analytical', 'research', 'coding', 'creative', 'strategic', 'troubleshooting', 'general'];

  return {
    needsClarification: !!parsed.needsClarification,
    clarificationReason: parsed.clarificationReason || null,
    depthLevel: validDepths.includes(parsed.depthLevel) ? parsed.depthLevel : 'deep',
    taskType: validTasks.includes(parsed.taskType) ? parsed.taskType : 'general',
    confidenceScore: Math.max(0, Math.min(1, Number(parsed.confidenceScore) || 0.7)),
    hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses.filter((h: any) => typeof h === 'string') : [],
    ambiguities: Array.isArray(parsed.ambiguities) ? parsed.ambiguities.filter((a: any) => typeof a === 'string') : [],
  };
}

// ── Stage 2: Clarification System Prompt ─────────────────────────────

export function getClarificationSystemPrompt(
  analysis: QueryAnalysis,
  modelId?: string
): string {
  const hypothesesBlock = analysis.hypotheses.length >= 2
    ? `\nThe query could mean any of these:\n${analysis.hypotheses.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n`
    : '';

  const ambiguitiesBlock = analysis.ambiguities && analysis.ambiguities.length > 0
    ? `\nSpecific ambiguities detected:\n${analysis.ambiguities.map(a => `• ${a}`).join('\n')}\n`
    : '';

  const intel = modelId ? getModelIntelligence(modelId) : null;

  const toneInstruction = intel?.provider === 'anthropic'
    ? 'Warm and intellectually curious. Show genuine interest in their problem. Build to the questions naturally.'
    : intel?.provider === 'openai' && intel?.isReasoningModel
    ? 'Direct and precise. State what you need and why concisely. No warm-up.'
    : intel?.provider === 'xai'
    ? 'Direct, no-nonsense. Ask what you need. Skip the preamble.'
    : intel?.provider === 'google'
    ? 'Clear and structured. Lead with a brief summary of what you understand, then ask.'
    : 'Professional and direct. Warm but not effusive.';

  return `You are operating in DEEP THINK MODE on ConvoiaAI.

You analyzed the user's query and identified genuine ambiguity that would produce fundamentally different answers depending on what they actually mean.
${hypothesesBlock}${ambiguitiesBlock}
YOUR TASK:
Ask the ONE most important clarifying question — not multiple.
The single question that, when answered, most reduces ambiguity.

If hypotheses are listed above: frame your question as a choice between those interpretations. Do not invent new ones.

Example of a good clarifying question:
"Before I go deep — are you asking about [hypothesis 1] or [hypothesis 2]? The answer changes significantly depending on which direction you need."

TONE: ${toneInstruction}

RULES:
- Ask maximum ONE question
- Make it a choice question when possible ("Are you X or Y?" is better than "What do you mean?")
- Show in 1 sentence that you understand their topic
- Explain in 1 sentence WHY you're asking (what changes based on their answer)
- Never ask a question that could be answered with a simple yes/no unless yes/no genuinely separates the interpretations
- Do NOT start answering the question
- Do NOT say "Great question" or "I'd be happy to help"
- Keep the entire response under 100 words

FORMAT:
[1 sentence: I understand you're asking about X]
[1 sentence: Before I answer, I need to know Y — because depending on your answer, Z changes significantly]
[The actual question — framed as a choice]`;
}

// ── Stage 3: Deep Research Prompt (Pass 1) ───────────────────────────

export function getDeepResearchPrompt(
  analysis: QueryAnalysis,
  modelId?: string,
  clarificationAnswers?: string
): string {
  const intel = modelId ? getModelIntelligence(modelId) : null;

  // ── Model-aware reasoning style ──
  let modelStyle = '';

  if (intel?.provider === 'anthropic') {
    modelStyle = `
REASONING STYLE FOR THIS MODEL:
You are Claude. Think inductively — build from specific observations to general principles. Show your reasoning as it develops. Use em-dashes to extend thoughts. Acknowledge genuine uncertainty with "I think" or "my read is". Build to your conclusion — don't lead with it. Show the work.`;
  } else if (intel?.isReasoningModel && intel?.provider === 'openai') {
    modelStyle = `
REASONING STYLE FOR THIS MODEL:
You are a reasoning model. Think deductively — state premises, derive implications, reach conclusions. Be mathematically precise about claims: "X implies Y because Z". Show the logical chain. Short sentences. Active voice. High signal density.`;
  } else if (intel?.provider === 'google') {
    modelStyle = `
REASONING STYLE FOR THIS MODEL:
You are Gemini. Think synthetically — gather perspectives, find patterns across them, synthesize into insight. Lead with a crisp summary of your conclusion, then support it. Tables for comparisons. Efficiency in prose.`;
  } else if (intel?.provider === 'xai') {
    modelStyle = `
REASONING STYLE FOR THIS MODEL:
Think directly. State what you see. Call out what's wrong with common takes before giving your own. Be willing to disagree with conventional wisdom if your reasoning supports it. Direct, confident, no hedging theater.`;
  } else if (intel?.provider === 'deepseek' && intel?.isReasoningModel) {
    modelStyle = `
REASONING STYLE FOR THIS MODEL:
Show your reasoning chain explicitly. State assumptions. Flag when you're uncertain vs. when you're confident. Mathematical or logical notation where it clarifies. Be thorough on technical details.`;
  } else if (intel?.provider === 'perplexity') {
    modelStyle = `
REASONING STYLE FOR THIS MODEL:
Ground every claim in sources where possible. Distinguish between: established fact, expert consensus, emerging evidence, and speculation. Cite as you reason, not just at the end.`;
  } else {
    modelStyle = `
REASONING STYLE:
Think step by step. Show your reasoning. Build to conclusions. Be specific — avoid generic claims. Acknowledge uncertainty honestly.`;
  }

  // ── Clarification injection ──
  const clarificationSection = clarificationAnswers
    ? `\nCLARIFICATION FROM USER:\n${clarificationAnswers}\n\nUse this to focus your research. The user has told you exactly what direction they need.`
    : '';

  // ── Depth-specific instructions ──
  const DEPTH_INSTRUCTIONS: Record<DepthLevel, string> = {
    surface: `
DEPTH: Surface
Give the direct, accurate answer with essential context. No multi-angle analysis needed. Be thorough but efficient.`,
    deep: `
DEPTH: Deep Analysis
This needs genuine analysis, not just information retrieval. Go beyond the obvious answer to what the user actually needs. Cover: the direct answer, the non-obvious insight, the common mistake to avoid, and what to do next.`,
    research: `
DEPTH: Full Research Mode
This is a complex problem requiring expert synthesis. Do NOT jump to conclusions. Work through it.

Cover ALL of these that apply:
1. What is actually being asked (vs. what was literally said)
2. The key tensions or trade-offs at play
3. Multiple valid approaches with honest pros/cons
4. What matters most given their likely constraints
5. The recommendation with specific reasoning
6. What would change your recommendation
7. What they're probably not thinking about but should be

Be the expert who has seen this problem 50 times and knows where people get it wrong.`,
  };

  // ── Task-specific angles ──
  const ANGLE_MAP: Record<TaskType, string> = {
    coding: `
TASK-SPECIFIC ANGLES (Coding):
Start with: what is the REAL problem? Often the stated coding question is a symptom of a design issue upstream.
- Architecture: Design patterns, component structure, data flow
- Implementation: Approach, algorithm choice, language/framework considerations
- Performance: Time/space complexity, bottlenecks, caching
- Security: Attack vectors, input validation, auth, data exposure
- Maintainability: Testing strategy, future extensibility
- Edge Cases: What could break? Null values, race conditions, scale limits`,

    troubleshooting: `
TASK-SPECIFIC ANGLES (Troubleshooting):
State your diagnostic hypothesis BEFORE listing causes. What do you think is most likely wrong, and why?
- Symptoms vs. Root Cause: What they're seeing vs. what's actually wrong
- Isolation: Narrow down where the problem occurs
- Common Causes: Most frequent reasons for this type of issue
- Uncommon Causes: Less obvious but possible explanations
- Verification: How to confirm which cause is correct before fixing
- Prevention: How to prevent recurrence`,

    strategic: `
TASK-SPECIFIC ANGLES (Strategic):
What is the user NOT saying that matters? What assumption are they making that may be wrong?
- Market & Positioning: Competitive landscape, timing, differentiation
- Business Model: Revenue streams, unit economics, margins
- Execution: Team requirements, timeline, dependencies
- Risk Assessment: What could go wrong, mitigation strategies
- Growth Path: Scaling strategy, acquisition, retention`,

    analytical: `
TASK-SPECIFIC ANGLES (Analytical):
What is the correct framing for this analysis? Is the user asking the right question?
- Quantitative: Numbers, metrics, benchmarks, data-driven insights
- Qualitative: User experience, strategic fit, cultural impact
- Comparative: How alternatives stack up — use a framework
- Risk/Reward: Trade-offs quantified, downside exposure, upside potential
- Second-Order Effects: Consequences of consequences`,

    research: `
TASK-SPECIFIC ANGLES (Research):
- Foundational: Core concepts, principles, mental models
- Current State: Latest developments, consensus view
- Debates & Open Questions: Areas of disagreement
- Practical Applications: Real-world use cases
- Evidence Quality: How strong is the evidence?
- Future Direction: Where this is heading`,

    factual: `
TASK-SPECIFIC ANGLES (Factual):
- Core Answer: Direct, accurate, verified
- Context: Why this matters, historical background
- Nuances: Edge cases, exceptions, common misconceptions
- Practical Relevance: How this applies in practice`,

    creative: `
TASK-SPECIFIC ANGLES (Creative):
- Strategic Alignment: Why each approach works for the target audience
- Execution Quality: Specific, usable output (not outlines)
- Differentiation: What makes this stand out
- Multiple Directions: 2-3 distinct creative approaches
- Audience Psychology: What resonates emotionally`,

    general: `
TASK-SPECIFIC ANGLES (General):
- Primary Analysis: Most direct examination of the question
- Alternative Perspective: A different way to think about it
- Practical Considerations: Real-world constraints
- Blind Spots: What the user might not have considered`,
  };

  return `You are in DEEP THINK MODE on ConvoiaAI. A user needs expert-level analysis.
${modelStyle}
${clarificationSection}
${DEPTH_INSTRUCTIONS[analysis.depthLevel]}

TASK TYPE: ${analysis.taskType.toUpperCase()}
${ANGLE_MAP[analysis.taskType] || ANGLE_MAP.general}

${analysis.hypotheses.length > 0
    ? `INTERPRETATIONS TO CONSIDER:\n${analysis.hypotheses.map((h, i) => `${i + 1}. ${h}`).join('\n')}\nAddress the most likely but note where others apply.`
    : ''}

RESEARCH QUALITY RULES:
- Every claim needs reasoning behind it, not just assertion
- Specific beats general: numbers, examples, code over abstract advice
- Honest uncertainty: "I'm confident about X, less certain about Y"
- Challenge your first answer: is it actually right?
- The insight that would make an expert nod — include it
- The mistake most people make here — name it

This is your research phase. Think thoroughly.
The user will see a polished version of this in the next step.`;
}

// ── Stage 4: Iterative Refinement (Pass 2) ───────────────────────────

export function buildRefinementPrompt(
  researchOutput: string,
  originalQuery: string,
  analysis: QueryAnalysis,
  modelId?: string
): string {
  const intel = modelId ? getModelIntelligence(modelId) : null;

  const outputStyle = intel?.provider === 'anthropic'
    ? `Write in flowing prose with clear structure. Use headers sparingly — only when sections are truly distinct. Let reasoning show in how you write, not just what you say. Em-dashes for extended thoughts. Build to your conclusion.`
    : intel?.isReasoningModel
    ? `Be precise and direct. Lead with the answer. Support with tight reasoning. Short paragraphs. Tables for comparisons. Code for code questions. No warm-up. High information density.`
    : intel?.provider === 'google'
    ? `Summary first, always. One crisp sentence with the answer. Then support it with organized sections. Tables for anything comparative. Efficient — no redundancy.`
    : intel?.provider === 'xai'
    ? `Direct. Say what you think. Call out what's wrong with the conventional take if relevant. No hedging theater. Confident prose.`
    : intel?.provider === 'perplexity'
    ? `Cite sources inline as you make claims. Lead with answer, support with evidence. Distinguish established fact from inference.`
    : `Clear, structured, expert. Lead with the answer. Support with reasoning. Use formatting where it helps.`;

  // Scale truncation by depth — research queries need more Pass 1 context
  // for good refinement. Was fixed at 3000 chars, which lost up to half of
  // research-depth analysis.
  const maxResearchChars = analysis.depthLevel === 'research' ? 8000
    : analysis.depthLevel === 'deep' ? 5000
    : 3000;
  const truncatedResearch = researchOutput.length > maxResearchChars
    ? researchOutput.slice(0, maxResearchChars) + '\n[analysis continues — synthesize all key points above]'
    : researchOutput;

  const taskHint = analysis.taskType === 'coding'
    ? '\nThis is a CODING question — include actual code, not pseudocode.'
    : analysis.taskType === 'troubleshooting'
    ? '\nThis is a TROUBLESHOOTING question — lead with the most likely cause and fix.'
    : analysis.taskType === 'strategic'
    ? '\nThis is a STRATEGY question — give a clear recommendation with reasoning.'
    : '';

  return `You just completed a deep research phase on this question:
"${originalQuery}"

Here is your research:
---
${truncatedResearch}
---

Now write the FINAL RESPONSE for the user.
${taskHint}
CRITICAL INSTRUCTION: Do not summarize the research. BUILD on it. The research is your thinking — the response is your conclusion.

The difference:
- Summarizing: "I found three approaches: A, B, C..."
- Building: "The answer is B — and here's why A fails and why C is only right in edge case X..."

OUTPUT STYLE FOR THIS MODEL:
${outputStyle}

SELF-CRITIQUE BEFORE WRITING:
Ask yourself:
1. What is the single most important thing the user needs to know? → Lead with that.
2. What do most people get wrong about this? → Say it directly.
3. What is my actual recommendation, and am I confident in it? → State it without hedging theater.
4. What would an expert in this field add that a generalist wouldn't? → Include it.

REQUIRED SECTIONS (adapt format to model style above):

**Core Answer** — direct, specific, actionable
[Not "it depends" — give the actual answer with the conditions stated]

**Why This Is Right / The Key Insight**
[The reasoning that makes this answer defensible]
[The thing most people miss or get wrong]

**How To Act On This**
[Concrete next steps, specific tools, actual code, real numbers]
[If there are multiple paths, rank them: "Do X first, then Y if Z"]

**One Follow-Up Worth Exploring**
[ONE specific question or direction that would deepen their situation]
[Not generic — specific to what they told you]
[Frame as: "The next question worth asking is X — because Y"]

RULES:
- Do NOT start with "Here's my analysis" or any filler
- Do NOT reference "the research phase" or "my analysis above"
- Do NOT hedge with "it depends" without immediately giving the conditions
- Every sentence must earn its place
- Sound like the most knowledgeable person in the room who also happens to communicate clearly`;
}
