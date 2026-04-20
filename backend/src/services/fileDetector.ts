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

  // PPTX — "powerpoint", "pptx", "slide deck", "pitch deck"
  if (/\b(powerpoint|pptx?|slide\s*deck|pitch\s*deck|\.pptx?)\b/.test(msg)) {
    return { format: 'pptx', formatLabel: 'PowerPoint', description: userMessage };
  }

  // XLSX — "excel", "xlsx", "spreadsheet", "workbook"
  if (/\b(excel|xlsx?|spreadsheet|workbook|\.xlsx?)\b/.test(msg)) {
    return { format: 'xlsx', formatLabel: 'Excel Spreadsheet', description: userMessage };
  }

  return null;
}
