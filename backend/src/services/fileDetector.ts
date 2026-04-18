/**
 * File Generation Intent Detector — classifies a user message as a
 * request for a generated document (pdf / docx / pptx / xlsx) or
 * returns null if no file intent is detected.
 *
 * Ordered check: a message mentioning "PowerPoint" wins over a
 * fallback "generate document" rule, so pattern order inside each
 * format matters.
 */

export interface FileIntent {
  format: 'pdf' | 'docx' | 'pptx' | 'xlsx';
  formatLabel: string;
  description: string;
}

const FORMAT_PATTERNS: Array<{
  format: FileIntent['format'];
  label: string;
  patterns: RegExp[];
}> = [
  {
    format: 'pptx',
    label: 'PowerPoint',
    patterns: [
      /\b(create|make|generate|build)\b.*\b(pptx|powerpoint|presentation|slide\s*deck|slides?|deck)\b/i,
      /\b(presentation|pptx|powerpoint|slide\s*deck)\b.*\b(about|for|on|of)\b/i,
      /\bpitch\s*deck\b/i,
    ],
  },
  {
    format: 'xlsx',
    label: 'Excel Spreadsheet',
    patterns: [
      /\b(create|make|generate|build)\b.*\b(xlsx|xls|excel|spreadsheet|workbook)\b/i,
      /\b(spreadsheet|excel|xlsx|workbook)\b.*\b(for|with|about|tracking|template)\b/i,
      /\b(budget|tracker|inventory|schedule|calendar|financial\s*model)\b.*\b(spreadsheet|excel|sheet|xlsx)\b/i,
    ],
  },
  {
    format: 'pdf',
    label: 'PDF',
    patterns: [
      /\b(create|make|generate|build|produce|write)\b.*\bpdf\b/i,
      /\bpdf\b.*\b(report|document|file|invoice|receipt|certificate|resume|cv)\b/i,
      /\b(report|invoice|receipt|certificate)\b.*\bpdf\b/i,
      /\bexport\b.*\bas\b.*\bpdf\b/i,
      /\bsave\b.*\bas\b.*\bpdf\b/i,
    ],
  },
  {
    format: 'docx',
    label: 'Word Document',
    patterns: [
      /\b(create|make|generate|build|write)\b.*\b(word|docx|\.doc)\b/i,
      /\b(word|docx)\b.*\b(document|file|report|memo|letter|template|proposal|contract)\b/i,
      /\b(memo|letter|proposal|contract|template)\b.*\b(word|docx|document)\b/i,
      /\bwrite\b.*\b(memo|letter|proposal|contract)\b.*\b(document|file)\b/i,
      /\b(create|make|generate)\b.*\b(document|report)\b(?!.*\b(pdf|slide|sheet|excel|powerpoint|ppt|xlsx)\b)/i,
    ],
  },
];

export function detectFileIntent(userMessage: string): FileIntent | null {
  const trimmed = userMessage.trim();
  if (trimmed.length < 5) return null;

  for (const fmt of FORMAT_PATTERNS) {
    for (const pattern of fmt.patterns) {
      if (pattern.test(trimmed)) {
        return {
          format: fmt.format,
          formatLabel: fmt.label,
          description: trimmed,
        };
      }
    }
  }
  return null;
}
