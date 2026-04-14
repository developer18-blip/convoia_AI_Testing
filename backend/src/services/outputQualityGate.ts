/**
 * Output Quality Gate — Post-stream cleanup for persistence.
 *
 * IMPORTANT: These functions run AFTER the stream completes, on the
 * assembled `fullResponse`. They are NOT used to filter the live SSE
 * stream — buffering mid-stream would delay first-token output and
 * regress the UX. The primary defense against thinking preamble is the
 * task-specific system prompts; this gate is a safety net for what gets
 * persisted to DB + cached + shown on reload.
 */

import logger from '../config/logger.js';

// Patterns that indicate the model is "thinking out loud" instead of delivering
const THINKING_PREAMBLE_PATTERNS: RegExp[] = [
  /^(Let me|I'll|I need to|I should|I want to|I'm going to)\s+(think|plan|consider|analyze|break|work|figure|map|outline|create a plan)/i,
  /^(Thinking|Planning|Analyzing|Considering|Breaking down|Working through)\b/i,
  /^(Okay|OK|Alright|Sure|Right),?\s+(let me|I'll|so)\s+(think|start|begin|work|figure)/i,
  /^(First|Before I|To approach this),?\s+(let me|I need to|I'll)\s+(think|understand|break|consider|plan)/i,
  /^(Here's my|This is my)\s+(thought process|thinking|approach|plan|strategy)/i,
];

// Patterns that indicate meta-commentary rather than the deliverable itself
const META_COMMENTARY_PATTERNS: RegExp[] = [
  /^(Here(?:'s| is) (?:the|your|a) (?:blog|article|post|story|code|response|answer|content|essay|report|guide|plan|analysis))[:.\s]/i,
  /^(I've (?:written|created|drafted|composed|prepared) (?:the|your|a))/i,
  /^(Below is|Here you go|As requested|Per your request)\b/i,
];

/**
 * Strip leading thinking/meta-commentary from a completed response.
 * Returns the cleaned text, or null if no cleaning was necessary.
 *
 * Only operates on the START of the response — never mutates the middle
 * or end. Conservative: if there's no clear break point, returns null
 * rather than risk corrupting legitimate content.
 */
export function cleanResponseStart(text: string): string | null {
  if (!text || text.length < 50) return null;

  const head = text.substring(0, 600);

  // Check thinking preamble first
  for (const pattern of THINKING_PREAMBLE_PATTERNS) {
    if (pattern.test(head)) {
      const breakIdx = text.search(/\n\n(?=[A-Z#*\-])/);
      if (breakIdx > 0 && breakIdx < text.length * 0.5) {
        const cleaned = text.substring(breakIdx + 2).trim();
        logger.info(`[quality-gate] stripped ${breakIdx} chars of thinking preamble`);
        return cleaned;
      }
      return null; // no clear break — leave as-is to avoid corrupting content
    }
  }

  // Check meta-commentary
  for (const pattern of META_COMMENTARY_PATTERNS) {
    if (pattern.test(head)) {
      const firstNewline = text.indexOf('\n');
      if (firstNewline > 0 && firstNewline < 200) {
        const cleaned = text.substring(firstNewline + 1).trim();
        const droppedLine = text.substring(0, firstNewline).substring(0, 80);
        logger.info(`[quality-gate] stripped meta-commentary "${droppedLine}"`);
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Check whether a completed response appears to have been cut off.
 * Used for diagnostic logging — upstream callers can also use it to
 * decide whether to offer the user a "Continue" action.
 */
export function isResponseIncomplete(text: string, intent: string): boolean {
  if (!text || text.length < 100) return false;

  const trimmed = text.trim();

  // Unclosed code block
  const codeBlockCount = (trimmed.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    logger.info(`[quality-gate] response has unclosed code block (intent=${intent})`);
    return true;
  }

  // Mid-list cut-off
  if (/\n\d+\.\s*$/.test(trimmed) || /\n[-*]\s*$/.test(trimmed)) {
    logger.info(`[quality-gate] response cut off mid-list (intent=${intent})`);
    return true;
  }

  // Missing terminal punctuation on long-form content
  const hasTerminal = /[.!?:)\]"'`]\s*$/.test(trimmed);
  if (!hasTerminal) {
    const longFormIntents = ['long_form_writing', 'creative_writing', 'analysis', 'research'];
    if (longFormIntents.includes(intent) && trimmed.length > 500) {
      logger.info(`[quality-gate] long-form response missing terminal punctuation (intent=${intent}, len=${trimmed.length})`);
      return true;
    }
  }

  return false;
}
