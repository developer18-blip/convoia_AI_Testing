/**
 * File Generation Intent Detector — classifies a user message as a
 * request for a generated document (pdf / docx / pptx / xlsx) or
 * returns null if no file intent is detected.
 *
 * Core rule (deliberately strict): file generation fires ONLY when
 * the user explicitly names a file format. Otherwise it's a normal
 * chat request. No verb detection, no negative patterns — just
 * "does the message contain a format word?"
 *
 * Examples:
 *   "Write a letter to Premera Insurance"        → null (chat)
 *   "Draft a memo to the team"                   → null (chat)
 *   "Create a PDF report"                        → PDF
 *   "Save this letter as a Word doc"             → DOCX
 *   "Make a pitch deck for investors"            → PPTX
 *   "Export this as an Excel spreadsheet"        → XLSX
 */

export interface FileIntent {
  format: 'pdf' | 'docx' | 'pptx' | 'xlsx';
  formatLabel: string;
  description: string;
}

export function detectFileIntent(userMessage: string): FileIntent | null {
  const msg = userMessage.toLowerCase();

  // PDF — explicit "pdf" token
  if (/\bpdf\b/.test(msg)) {
    return { format: 'pdf', formatLabel: 'PDF', description: userMessage };
  }

  // DOCX — "word doc", "word document", "word file", "docx", ".doc"/".docx"
  if (/\b(word\s*doc(ument)?|word\s*file|docx|\.docx?)\b/.test(msg)) {
    return { format: 'docx', formatLabel: 'Word Document', description: userMessage };
  }

  // PPTX — unambiguous format tokens (match anywhere)
  if (/\b(powerpoint|pptx?|slide\s*deck|pitch\s*deck|\.pptx?)\b/.test(msg)) {
    return { format: 'pptx', formatLabel: 'PowerPoint', description: userMessage };
  }

  // PPTX — "presentation" / "slides" on their own are more ambiguous
  // ("my presentation went well", "the slides in the deck") so require a
  // command-shaped verb nearby. Catches:
  //   "create a presentation about AI trends"
  //   "make me slides on quarterly results"
  //   "design a presentation for investors"
  //   "i need a presentation on X" / "give me slides for Y"
  // Verbs like "prepare"/"produce" are intentionally excluded because
  // "prepare for the presentation" is a far more common phrasing than
  // "prepare a presentation" in chat, so they produce more false
  // positives than true matches.
  if (/\b(create|make|generate|build|design|draft|write|compose|give\s*me|i\s*(want|need))\b[\s\S]{1,60}\b(presentation|slides?)\b/.test(msg)) {
    return { format: 'pptx', formatLabel: 'PowerPoint', description: userMessage };
  }

  // XLSX — "excel", "xlsx", "spreadsheet", "workbook"
  if (/\b(excel|xlsx?|spreadsheet|workbook|\.xlsx?)\b/.test(msg)) {
    return { format: 'xlsx', formatLabel: 'Excel Spreadsheet', description: userMessage };
  }

  return null;
}
