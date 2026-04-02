/**
 * Extended Thinking Service — 3-Stage Reasoning Pipeline
 *
 * Stage 1: Query Analysis (rule-based, no model call)
 * Stage 2: Clarification (if query is vague)
 * Stage 3: Multi-pass reasoning (deep think → self-critique → refined answer)
 */

import logger from '../config/logger.js';

// ── Types ────────────────────────────────────────────────────────────

export interface QueryAnalysis {
  needsClarification: boolean;
  confidenceScore: number; // 0–1
  taskType: 'coding' | 'analysis' | 'research' | 'creative' | 'general';
  reasons: string[];
}

// ── Stage 1: Query Analysis ──────────────────────────────────────────

/**
 * Analyze a user query to determine clarity, confidence, and task type.
 * Rule-based — no model call, instant.
 *
 * Considers:
 * - Query length and specificity
 * - Conversation history (follow-ups don't need to be long)
 * - Presence of vague/ambiguous terms
 * - Missing constraints
 */
export function analyzeQuery(
  query: string,
  messageHistory: Array<{ role: string; content: string }>
): QueryAnalysis {
  const reasons: string[] = [];
  let confidence = 0.8; // Start optimistic

  const words = query.trim().split(/\s+/);
  const wordCount = words.length;
  const hasConversationContext = messageHistory.filter(m => m.role === 'user').length > 1;
  const hasDocumentContext = query.includes('Here is the attached document content:');

  // ── Task type detection ──
  let taskType: QueryAnalysis['taskType'] = 'general';

  if (/\b(code|function|class|api|bug|error|debug|implement|refactor|regex|sql|query|script|deploy|docker|git)\b/i.test(query)) {
    taskType = 'coding';
  } else if (/\b(analyze|compare|evaluate|assess|benchmark|audit|review|performance|metrics|data|statistics|trend)\b/i.test(query)) {
    taskType = 'analysis';
  } else if (/\b(research|find out|what is|who is|how does|explain|history|background|overview)\b/i.test(query)) {
    taskType = 'research';
  } else if (/\b(write|create|draft|design|brainstorm|generate|story|poem|content|marketing|email|blog)\b/i.test(query)) {
    taskType = 'creative';
  }

  // ── Document context: always clear (user uploaded a file + asked a question) ──
  if (hasDocumentContext) {
    return { needsClarification: false, confidenceScore: 0.9, taskType, reasons: ['document context provided'] };
  }

  // ── Follow-up in conversation: relaxed requirements ──
  if (hasConversationContext && wordCount >= 3) {
    return { needsClarification: false, confidenceScore: 0.85, taskType, reasons: ['follow-up with conversation context'] };
  }

  // ── Very short standalone queries (< 5 words, no conversation context) ──
  if (wordCount < 5 && !hasConversationContext) {
    confidence -= 0.3;
    reasons.push('query is very short — may need more detail');
  } else if (wordCount < 10 && !hasConversationContext) {
    confidence -= 0.1;
  }

  // ── Vague action words without specific target ──
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

  // ── Multi-part or ambiguous scope ──
  if (/\b(everything|all|complete|full|entire)\b/i.test(query) && wordCount < 15) {
    confidence -= 0.15;
    reasons.push('broad scope — may need to narrow down');
  }

  // ── Missing constraints ──
  // For coding: no language/framework specified
  if (taskType === 'coding' && !/\b(python|javascript|typescript|java|rust|go|react|node|express|sql|html|css|c\+\+|c#|swift|kotlin|php|ruby)\b/i.test(query)) {
    confidence -= 0.1;
    reasons.push('no programming language or framework specified');
  }

  // ── Specific, well-formed queries: boost confidence ──
  if (wordCount >= 20) confidence += 0.1;
  if (/\?$/.test(query.trim())) confidence += 0.05; // ends with question mark
  if (/\b(specifically|exactly|precisely|in particular)\b/i.test(query)) confidence += 0.1;
  if (/```/.test(query)) confidence += 0.15; // contains code block

  // Clamp
  confidence = Math.max(0, Math.min(1, confidence));

  const needsClarification = confidence < 0.6 && !hasConversationContext;

  if (needsClarification) {
    logger.info(`Query needs clarification (confidence=${confidence.toFixed(2)}): "${query.substring(0, 80)}"`);
  }

  return { needsClarification, confidenceScore: confidence, taskType, reasons };
}

// ── Stage 2: Clarification System Prompt ─────────────────────────────

/**
 * System prompt that makes the model ASK clarifying questions
 * instead of answering directly.
 */
export function getClarificationSystemPrompt(analysis: QueryAnalysis): string {
  const reasonsList = analysis.reasons.map(r => `- ${r}`).join('\n');

  return `You are an expert consultant. The user's query needs clarification before you can give a precise answer.

DETECTED ISSUES:
${reasonsList}

YOUR TASK:
- Ask 2–4 specific, targeted questions that will help you give a much better answer
- Questions must directly address the gaps identified above
- Do NOT give a generic answer or guess
- Do NOT ask obvious or generic questions like "what is your goal?" — be specific to their query
- Frame questions naturally, like a senior expert would

FORMAT:
Start with a brief acknowledgment of what they're asking, then list your questions numbered 1-4.
End with: "Once you answer these, I'll give you a precise, detailed response."`;
}

// ── Stage 3: Multi-Pass Prompts ──────────────────────────────────────

/**
 * Enhanced system prompt for Pass 1: Deep Thinking.
 * Tailored by task type for more relevant reasoning.
 */
export function getDeepThinkingSystemPrompt(taskType: QueryAnalysis['taskType']): string {
  const BASE = `You are an advanced reasoning AI operating in DEEP THINKING mode.

STRICT REASONING PROCESS:
1. UNDERSTAND — Restate the core problem in your own words. Identify what's actually being asked.
2. DECOMPOSE — Break it into sub-problems or steps. Identify dependencies between steps.
3. ANALYZE — Work through each step methodically. Consider edge cases, trade-offs, and alternatives.
4. VALIDATE — Check your reasoning for logical gaps, incorrect assumptions, or missing considerations.
5. SYNTHESIZE — Build a complete, actionable solution from your analysis.

RULES:
- Prefer correctness over speed
- Show your reasoning — don't just state conclusions
- If multiple approaches exist, compare them before choosing
- Flag any assumptions you're making
- Be specific, not generic`;

  const TASK_ADDITIONS: Record<string, string> = {
    coding: `\n\nCODING-SPECIFIC:
- Consider performance, security, edge cases, and error handling
- Mention time/space complexity if relevant
- Provide production-ready code, not simplified examples
- Include relevant imports and types`,

    analysis: `\n\nANALYSIS-SPECIFIC:
- Support claims with data or logical reasoning
- Use structured comparisons (tables, pros/cons)
- Quantify where possible
- End with actionable recommendations`,

    research: `\n\nRESEARCH-SPECIFIC:
- Distinguish facts from opinions
- Note when information might be outdated
- Provide multiple perspectives if the topic is debated
- Cite specific examples or cases`,

    creative: `\n\nCREATIVE-SPECIFIC:
- Provide 2-3 distinct approaches or directions
- Explain the strategic reasoning behind each choice
- Tailor tone and style to the target audience
- Include specific, usable content (not just outlines)`,

    general: '',
  };

  return BASE + (TASK_ADDITIONS[taskType] || '');
}

/**
 * Build the refinement prompt for Pass 2: Self-Critique.
 * Takes the Pass 1 output and asks the model to improve it.
 */
export function buildRefinementPrompt(thinkingOutput: string, originalQuery: string): string {
  return `You are a senior expert reviewer. Below is a detailed analysis of a user's question. Your job is to REFINE it into a polished, high-quality final answer.

ORIGINAL QUESTION:
${originalQuery}

INITIAL ANALYSIS:
${thinkingOutput}

YOUR TASK:
1. Fix any errors, shallow reasoning, or incorrect claims in the analysis
2. Remove redundancy and filler — keep only what adds value
3. Improve structure — use headers, bullet points, tables where appropriate
4. Make the answer MORE specific and actionable
5. Ensure the final answer directly addresses what the user asked

IMPORTANT:
- Output ONLY the improved final answer — do not reference "the analysis above"
- Do not start with "Here's the refined answer" — just give the answer directly
- Be concise but thorough — every sentence must earn its place
- Use markdown formatting for readability`;
}
