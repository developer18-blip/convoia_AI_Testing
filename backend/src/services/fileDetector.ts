/**
 * File Generation Intent Detector — classifies a user message as a
 * request for a generated document (pdf / docx / pptx / xlsx) or
 * returns null if no file intent is detected.
 *
 * Core rule: file generation fires ONLY when the user explicitly
 * names a file format. "Write a letter to Premera" = normal chat
 * (compose text). "Save that letter as a Word document" = file.
 *
 * Matching format keywords: pdf, word doc, docx, powerpoint, pptx,
 * slide deck, pitch deck, excel, xlsx, spreadsheet, workbook.
 */

export interface FileIntent {
  format: 'pdf' | 'docx' | 'pptx' | 'xlsx';
  formatLabel: string;
  description: string;
}

interface FormatSignal {
  format: FileIntent['format'];
  label: string;
  /** Format-name patterns that indicate the user wants this specific format. */
  keywords: RegExp[];
  /** Action verbs that, combined with a keyword, confirm generation intent. */
  verbs: RegExp;
}

const FORMAT_SIGNALS: FormatSignal[] = [
  {
    format: 'pdf',
    label: 'PDF',
    keywords: [/\bpdf\b/i],
    verbs: /\b(create|make|generate|build|produce|export|save|download|convert)\b/i,
  },
  {
    format: 'docx',
    label: 'Word Document',
    keywords: [
      /\bword\s*doc(ument)?\b/i,
      /\bword\s*file\b/i,
      /\bdocx\b/i,
      /\b\.docx?\b/i,
    ],
    verbs: /\b(create|make|generate|build|produce|export|save|download|convert)\b/i,
  },
  {
    format: 'pptx',
    label: 'PowerPoint',
    keywords: [
      /\bpowerpoint\b/i,
      /\bpptx?\b/i,
      /\b\.pptx?\b/i,
      /\bslide\s*deck\b/i,
      /\bpitch\s*deck\b/i,
      /\bpresentation\s*(file|document|deck)\b/i,
    ],
    verbs: /\b(create|make|generate|build|produce|export|save|download|convert)\b/i,
  },
  {
    format: 'xlsx',
    label: 'Excel Spreadsheet',
    keywords: [
      /\bexcel\b/i,
      /\bxlsx?\b/i,
      /\b\.xlsx?\b/i,
      /\bspreadsheet\b/i,
      /\bworkbook\b/i,
    ],
    verbs: /\b(create|make|generate|build|produce|export|save|download|convert)\b/i,
  },
];

/**
 * Phrases where the user is asking the assistant to compose text
 * (letters, memos, reports) — not to produce a downloadable file.
 * These short-circuit to null UNLESS the user also names a format.
 */
const CHAT_NOT_FILE_PATTERNS: RegExp[] = [
  /\bwrite\b.*\bletter\b\s*(to|for|about|regarding|on)\b/i,
  /\b(write|draft|compose|send)\b.*\b(memo|email|message|note|reply|response)\b\s*(to|for|about|regarding)\b/i,
  /\bwrite\b.*\b(report|proposal|essay|article|blog|story|summary|review|cover\s*letter)\b/i,
  /\b(draft|compose)\b.*\b(letter|email|memo|message)\b/i,
  /\bhelp\s*me\s*(write|draft|compose)\b/i,
];

/**
 * Weaker phrases where just a format keyword is enough — no verb needed.
 *   "I need a PDF of this"        → PDF
 *   "export as excel"             → XLSX
 *   "give me a Word doc"          → DOCX
 */
const WEAK_INTENT_TRIGGER = /\b(as|into|to|need|want|give\s*me|get\s*me|export|download|send\s*me)\b/i;

export function detectFileIntent(userMessage: string): FileIntent | null {
  const msg = userMessage.trim();
  if (msg.length < 5) return null;

  const mentionsFormat = FORMAT_SIGNALS.some((fmt) =>
    fmt.keywords.some((kw) => kw.test(msg)),
  );

  // "Write a letter to X", "draft a memo to the team" — the user wants
  // the assistant to compose text, not deliver a file. Skip unless the
  // same message explicitly names a file format.
  if (!mentionsFormat) {
    for (const chatPattern of CHAT_NOT_FILE_PATTERNS) {
      if (chatPattern.test(msg)) return null;
    }
  }

  for (const fmt of FORMAT_SIGNALS) {
    const hasKeyword = fmt.keywords.some((kw) => kw.test(msg));
    if (!hasKeyword) continue;

    const hasActionVerb = fmt.verbs.test(msg);
    const hasWeakTrigger = WEAK_INTENT_TRIGGER.test(msg);

    if (hasActionVerb || hasWeakTrigger) {
      return {
        format: fmt.format,
        formatLabel: fmt.label,
        description: userMessage,
      };
    }
  }

  return null;
}
