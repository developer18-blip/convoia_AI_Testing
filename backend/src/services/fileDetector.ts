/**
 * File Generation Intent Detector — AI-powered.
 *
 * Classifies a user message as a request to GENERATE a new downloadable
 * document (pdf / docx / pptx / xlsx), or returns null if the message
 * is something else (reading an uploaded file, asking about content,
 * writing text to show in chat, etc.).
 *
 * Why AI instead of regex: the keyword-based version kept mis-firing
 * — e.g. "can you explain me the updated pdf" (user asking about an
 * uploaded file) triggered a brand-new PDF generation, because "pdf"
 * was present. Only a context-aware classifier can tell "explain this
 * PDF" (read) from "make me a PDF" (generate).
 *
 * Layers (mirrors searchDecisionService):
 *   1. Hard short-circuit — if the user uploaded files and the message
 *      doesn't explicitly say "create/make/generate/... a new <format>",
 *      they're asking ABOUT the file, not requesting a new one.
 *   2. AI classifier — GPT-5.4 Nano (overridable via
 *      FILE_INTENT_MODEL env var) decides from the full message text,
 *      returning format + short reason.
 *   3. Null fallback — if the AI call fails or times out, we return
 *      null (safer to NOT generate a file when uncertain; the chat
 *      path still handles the message fine).
 *
 * Billing: the decision call is platform overhead — no UsageLog row,
 * no wallet deduction. Cost is ~$0.0001/query at Nano rates.
 */

import axios from 'axios';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

export interface FileIntent {
  format: 'pdf' | 'docx' | 'pptx' | 'xlsx';
  formatLabel: string;
  description: string;
}

export interface FileIntentContext {
  /** True when the user attached/uploaded a document in this turn. */
  hasUploadedFiles: boolean;
  /** Optional: file mime types or extensions (not required for decision). */
  uploadedFileTypes?: string[];
  /** Optional: last few messages, for future use if we want history context. */
  recentMessages?: Array<{ role: string; content: string }>;
}

const DEFAULT_DECISION_MODEL = process.env.FILE_INTENT_MODEL || 'gpt-5.4-nano';
const DECISION_TIMEOUT_MS = 1500;

const FORMAT_LABELS: Record<FileIntent['format'], string> = {
  pdf: 'PDF',
  docx: 'Word Document',
  pptx: 'PowerPoint',
  xlsx: 'Excel Spreadsheet',
};

// ── Layer 1: upload-context short-circuit ──────────────────────────────

/**
 * When the user has attached a file, the default assumption is that
 * they're asking ABOUT that file. Only short-circuit to file-generation
 * if the message explicitly uses a generation verb alongside a format
 * word ("create a PDF", "export to Word", "turn this into a presentation").
 */
function isExplicitGenerateWithUpload(message: string): boolean {
  return /\b(create|make|generate|build|produce|export|save|convert|turn)\s+(this\s+)?(in\s*)?(to\s+)?(a\s+)?(new\s+)?(pdf|docx?|word|pptx?|powerpoint|xlsx?|excel|spreadsheet|presentation|slides?|slide\s*deck|pitch\s*deck)\b/i.test(
    message,
  );
}

// ── Layer 2: AI classifier ─────────────────────────────────────────────

interface RawAIDecision {
  wants_file: boolean;
  format: FileIntent['format'] | null;
  reason: string;
}

const DECISION_PROMPT = (userMessage: string) => `You are a file-generation intent detector for an AI chat assistant.

DECIDE whether the user is explicitly asking for a NEW document FILE to be generated and downloaded. Valid formats: pdf, docx, pptx, xlsx.

Return wants_file=true ONLY when the user is clearly asking to CREATE / GENERATE / MAKE / BUILD / EXPORT / SAVE / CONVERT a downloadable file in a specific format.

Return wants_file=false for:
- explaining, summarizing, or analyzing an uploaded/existing document
- questions ABOUT a file ("what does this PDF say?", "explain the spreadsheet")
- writing text content the user wants to READ in chat ("write a letter to X", "draft an email")
- general conversation, code help, translations, brainstorming

Examples:
- "Write a letter to Premera Insurance"          → {"wants_file": false, "format": null, "reason": "text content, not a file"}
- "Create a PDF report about AI trends"          → {"wants_file": true,  "format": "pdf",  "reason": "explicit PDF request"}
- "Explain this PDF"                             → {"wants_file": false, "format": null, "reason": "reading existing file"}
- "Summarize the uploaded document"              → {"wants_file": false, "format": null, "reason": "summarizing existing"}
- "Make me a Word doc with meeting notes"        → {"wants_file": true,  "format": "docx", "reason": "explicit Word request"}
- "What are the key numbers in this spreadsheet" → {"wants_file": false, "format": null, "reason": "analyzing existing"}
- "Convert this to PDF"                          → {"wants_file": true,  "format": "pdf",  "reason": "explicit conversion"}
- "Turn this into a presentation"                → {"wants_file": true,  "format": "pptx", "reason": "explicit presentation request"}
- "Create a presentation about AI trends"        → {"wants_file": true,  "format": "pptx", "reason": "explicit presentation request"}
- "can you explain me the updated pdf"           → {"wants_file": false, "format": null, "reason": "asking about existing PDF"}

USER MESSAGE:
${userMessage}

Respond with ONLY valid JSON, no prose, no code fence:
{"wants_file": true|false, "format": "pdf"|"docx"|"pptx"|"xlsx"|null, "reason": "short sentence"}`;

async function aiDecideFileIntent(userMessage: string): Promise<FileIntent | null> {
  const apiKey = config.apiKeys.openai;
  if (!apiKey) return null;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: DEFAULT_DECISION_MODEL,
        messages: [{ role: 'user', content: DECISION_PROMPT(userMessage) }],
        max_tokens: 80,
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
    if (!parsed.wants_file || !parsed.format) return null;

    const format = parsed.format as FileIntent['format'];
    if (!FORMAT_LABELS[format]) return null;

    logger.info(`File intent: ${format} — ${parsed.reason || 'ai_decision'}`);
    return {
      format,
      formatLabel: FORMAT_LABELS[format],
      description: userMessage,
    };
  } catch (err: any) {
    logger.warn(`File intent AI call failed, defaulting to no file: ${err?.message || err}`);
    return null;
  }
}

// ── Public entry point ─────────────────────────────────────────────────

/**
 * Classify the user's message. Returns a FileIntent when the user wants
 * to generate a downloadable file, or null otherwise. Never throws.
 */
export async function detectFileIntent(
  userMessage: string,
  context: FileIntentContext = { hasUploadedFiles: false },
): Promise<FileIntent | null> {
  const msg = userMessage.trim();
  if (!msg) return null;

  // Layer 1 — if files are uploaded, require an explicit generation verb
  // paired with a format word. Otherwise the user is almost certainly
  // asking ABOUT the uploaded file, not requesting a new one.
  if (context.hasUploadedFiles && !isExplicitGenerateWithUpload(msg)) {
    return null;
  }

  // Layer 2 — AI classifier makes the final call.
  return aiDecideFileIntent(msg);
}
