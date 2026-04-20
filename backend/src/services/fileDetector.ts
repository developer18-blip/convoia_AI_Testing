/**
 * File Generation Intent Detector — classifies a user message as a
 * request for a generated document (pdf / docx / pptx / xlsx) or
 * returns null if no file intent is detected.
 *
 * Order matters: explicit-format buckets (PPTX/XLSX/PDF) run first so
 * phrases like "create a PDF report" don't get stolen by the looser
 * DOCX "create a report" fallback at the bottom.
 *
 * DOCX is the implicit fallback for anything document-shaped
 * ("write a memo", "create a report", "draft a proposal") when no
 * other format keyword is present.
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
      /\b(create|make|generate|build|prepare|draft|produce)\b.*\b(pptx|powerpoint|presentation|slide\s*deck|slides?|deck)\b/i,
      /\b(presentation|pptx|powerpoint|slide\s*deck|slides)\b.*\b(about|for|on|of|regarding|covering)\b/i,
      /\bpitch\s*deck\b/i,
    ],
  },
  {
    format: 'xlsx',
    label: 'Excel Spreadsheet',
    patterns: [
      /\b(create|make|generate|build|prepare)\b.*\b(xlsx|xls|excel|spreadsheet|workbook)\b/i,
      /\b(spreadsheet|excel|xlsx|workbook)\b.*\b(for|with|about|tracking|template|to\s*track)\b/i,
      /\b(budget|tracker|inventory|schedule|calendar|financial\s*model|expense)\b.*\b(spreadsheet|excel|sheet|xlsx|workbook|template)\b/i,
      /\b(create|make|build|prepare)\b.*\b(budget\s*(tracker|sheet)?|expense\s*tracker|inventory\s*(sheet|list)?|tracking\s*sheet|financial\s*model|monthly\s*budget|yearly\s*budget)\b/i,
    ],
  },
  {
    format: 'pdf',
    label: 'PDF',
    patterns: [
      /\b(create|make|generate|build|produce|write|prepare)\b.*\bpdf\b/i,
      /\bpdf\b.*\b(report|document|file|invoice|receipt|certificate|resume|cv)\b/i,
      /\b(report|invoice|receipt|certificate)\b.*\bpdf\b/i,
      /\bexport\b.*\bas\b.*\bpdf\b/i,
      /\bsave\b.*\bas\b.*\bpdf\b/i,
      /\bas\s*(a\s*)?pdf\b/i,
    ],
  },
  {
    format: 'docx',
    label: 'Word Document',
    patterns: [
      // Explicit Word-format mentions
      /\b(create|make|generate|build|write|draft|compose|prepare)\b.*\b(word\s*(document|doc|file)?|docx|\.doc)\b/i,
      /\b(word|docx)\b.*\b(document|file|report|memo|letter|template|proposal|contract)\b/i,

      // "write/draft a memo/letter/proposal/contract" — no format keyword needed
      /\b(write|draft|compose|prepare)\b.*\b(a|an|the|my)?\s*\b(memo|letter|proposal|contract|resume|cv|essay|article|cover\s*letter)\b/i,

      // Fallback: "create/make/generate a document/report" when NO other
      // format keyword is present. Negative lookahead keeps PDF/slide/
      // spreadsheet-shaped requests out.
      /\b(create|make|generate|build|write|draft|prepare|produce)\b.*\b(document|report)\b(?!.*\b(pdf|slide|sheet|excel|powerpoint|ppt|pptx|xlsx|spreadsheet|workbook|deck|presentation)\b)/i,
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
