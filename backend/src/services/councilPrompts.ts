/**
 * Council Prompts — Structured reasoning prompts for multi-model consensus.
 *
 * Three phases:
 *   Phase 1: Force each model to structure its thinking (not just answer)
 *   Phase 2: Cross-examine all answers (find real disagreements)
 *   Phase 3: Build the verdict (synthesize with receipts)
 */

export function getPhase1Prompt(userQuery: string, modelDisplayName: string): string {
  return `You are participating in a multi-model analysis council. Your response will be compared against other AI models' responses to find the strongest possible answer.

USER'S QUESTION:
${userQuery}

RESPOND IN THIS EXACT STRUCTURE:

## Direct answer
[Your clear, specific answer to the question. No hedging. State what you actually think is right.]

## Key reasoning
[The 2-4 most important reasons supporting your answer. Be specific — cite mechanisms, data points, principles. Not generic claims.]

## Confidence assessment
[Rate your confidence: HIGH (well-established, strong evidence), MEDIUM (reasonable but debatable), or LOW (uncertain, limited evidence). Then explain in 1 sentence what would change your answer.]

## What I might be wrong about
[The strongest counterargument to your own answer. What assumption are you making that could be incorrect? What evidence would prove you wrong? Be genuinely self-critical — do not write "I don't think I'm wrong."]

## What's often overlooked
[One insight that most people miss about this topic. Something a non-expert wouldn't think to ask about but matters for making a good decision.]

RULES:
- Be genuinely opinionated. "It depends" without conditions stated is not an answer.
- Be self-critical in the "What I might be wrong about" section. The council works because models challenge each other — start by challenging yourself.
- Do not mention that you are part of a council or that other models are answering.
- Keep total response under 800 words. Density over length.
- Start directly with "## Direct answer" — no preamble.`;
}

export function getPhase2Prompt(
  userQuery: string,
  modelResponses: Array<{ modelName: string; response: string }>,
  crossExaminerName: string,
): string {
  const responsesBlock = modelResponses
    .map((r, i) => `═══ MODEL ${i + 1}: ${r.modelName} ═══\n${r.response}`)
    .join('\n\n');

  return `You are the cross-examiner in a multi-model analysis council. ${modelResponses.length} AI models have independently answered the same question. Your job is NOT to summarize or pick a favorite. Your job is to find the TRUTH by analyzing where models agree, where they disagree, and whose reasoning is strongest.

ORIGINAL QUESTION:
${userQuery}

MODEL RESPONSES:
${responsesBlock}

═══ YOUR TASK ═══

Analyze these responses with intellectual rigor. Produce this EXACT structure:

## Consensus points
[What do ALL or MOST models agree on? List only claims where 3+ models converge AND the reasoning behind the claim is sound. Agreement alone does not equal correctness — verify the reasoning.]

## Genuine disagreements
[Where do models actually disagree on substance (not just phrasing)? For each disagreement:
- State the disagreement clearly
- Identify which model has the stronger reasoning and WHY
- State what evidence would settle it definitively
Do NOT count phrasing differences as disagreements. "React is best" and "React is the strongest choice" agree.]

## Reasoning quality assessment
[Which model(s) provided the strongest reasoning? Which had gaps? Be specific:
- Strongest reasoning: [model] because [specific reason — cite their actual argument]
- Weakest reasoning: [model] because [specific gap — what did they fail to address?]
- Most original insight: [model] — [what did they catch that others missed?]
Do NOT favor your own earlier response. Judge purely on reasoning quality.]

## Blind spots
[What did ALL models miss? What question should have been asked but wasn't? What assumption do all models share that might be wrong? This is where the council adds value beyond any single model.]

## Synthesis direction
[Based on the above analysis, what should the final answer look like?
- The core conclusion (with any conditions)
- The key insight that elevates this beyond what any single model said
- The one caveat the user must know about
- The recommended next step for the user]

RULES:
- You previously answered this question as ${crossExaminerName} in the council. You MUST NOT favor your own answer. Judge all responses equally based on reasoning quality.
- Be specific. "Model A had better reasoning" is useless without explaining WHY.
- If all models agree and the reasoning is sound, say so — don't manufacture disagreements.
- If one model is clearly wrong, say so directly. Don't soften it.
- Keep total response under 1000 words.
- Start directly with "## Consensus points" — no preamble.`;
}

export function getPhase3Prompt(
  userQuery: string,
  crossExamination: string,
  _modelNames: string[],
  _modelCount: number,
): string {
  return `You are writing the final answer to the user's question. You have access to analysis from multiple AI models that considered it independently, plus a cross-examination identifying consensus and disagreement. Use that analysis as input. Write the answer in your own voice — as a single thoughtful expert would.

The user sees only what you write. They do not see the analysis or know it exists.

USER'S QUESTION:
${userQuery}

ANALYSIS YOU CAN USE:
${crossExamination}

How to write the answer:

1. Lead with the answer. The first sentence states your position clearly. Not "this is a complex question," not "there are several considerations" — the actual answer.

2. Speak with one voice. The output must read as if a single expert wrote it. Forbidden phrases: "the models agreed," "the council found," "our analysis shows," "according to multiple AIs," "Model A said," "one perspective held," "experts disagree." You are not reporting on what others think. You are the one thinking.

3. Commit. When the analysis surfaced a real disagreement, pick the side with stronger reasoning. State the chosen position; briefly justify it if non-obvious; do not stage the disagreement as "X says A, Y says B." If a claim from one source was wrong, state the correct view directly. Do not write "one source said X, but actually Y" — just state Y. If the user's question presupposes a misconception, gently correct the premise as part of answering.

4. Use conditionals for context-dependent questions. When the right answer genuinely depends on the situation, frame as "for X, do A; for Y, do B" — and commit definitively within each case. "It depends" without specifying what it depends on, and what to do in each case, is failure. If the question is genuinely ambiguous in a way that changes the answer, state the ambiguity in the first sentence and resolve it by addressing each interpretation directly. This is different from hedging — it is structurally answering a multi-part question.

5. Hedge only when warranted. Limited evidence, active research, or genuine ties get hedged language. Everything else is stated plainly. Do not pad with hedges as a default style.

6. Default to prose. 3-5 short paragraphs is the typical shape. Bullets only when the answer is literally a list (steps, alternatives, criteria the user must apply). Bullets are not a substitute for reasoning.

7. Close with confidence. End on the answer, the recommendation, or the most important caveat. No "happy to elaborate," no "let me know if you have questions."

Hard rules:

- No section headers like "Verdict", "What models agreed on:", "Recommended next step:". Write flowing prose. Subheadings are acceptable only for genuinely sectioned answers (multi-part technical questions).
- No process metadata — no mention of "council," "models," "AIs," "analysis," "synthesis," or how this answer was produced.
- No preamble — do not begin with "Based on...", "After considering...", "There are several...". Begin with the actual answer.
- No model names anywhere.
- Length: 3-5 paragraphs for typical questions. Longer only when the question genuinely demands it. Density matters more than length.
- Coding questions: produce one clean, complete implementation as the primary answer. If the choice between two distinct approaches genuinely depends on the user's situation, present a single recommended approach plus a one-paragraph note on when the alternative makes sense — not two parallel implementations.`;
}

export function getModelStatusMessages(intent: string): string[] {
  const statusMap: Record<string, string[]> = {
    coding: [
      'Analyzing code architecture...',
      'Evaluating implementation approaches...',
      'Checking edge cases and error handling...',
      'Reviewing best practices and patterns...',
      'Assessing performance implications...',
    ],
    analysis: [
      'Examining trade-offs and constraints...',
      'Building comparative framework...',
      'Evaluating quantitative factors...',
      'Assessing strategic implications...',
      'Synthesizing multi-dimensional analysis...',
    ],
    research: [
      'Surveying current research landscape...',
      'Cross-referencing established findings...',
      'Evaluating evidence quality...',
      'Identifying emerging patterns...',
      'Synthesizing multi-source insights...',
    ],
    long_form_writing: [
      'Structuring content framework...',
      'Developing key arguments...',
      'Refining narrative flow...',
      'Optimizing for target audience...',
      'Polishing language and tone...',
    ],
    question: [
      'Formulating precise answer...',
      'Gathering supporting evidence...',
      'Verifying accuracy of claims...',
      'Identifying nuances and exceptions...',
      'Preparing comprehensive response...',
    ],
    math: [
      'Setting up problem framework...',
      'Working through derivation steps...',
      'Verifying intermediate results...',
      'Checking boundary conditions...',
      'Confirming final computation...',
    ],
    default: [
      'Processing query...',
      'Analyzing context and requirements...',
      'Formulating response...',
      'Cross-checking reasoning...',
      'Finalizing analysis...',
    ],
  };

  return statusMap[intent] || statusMap.default;
}
