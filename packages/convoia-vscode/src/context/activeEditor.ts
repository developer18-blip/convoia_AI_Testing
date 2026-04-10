/**
 * Active Editor Tracker — tracks open files, selection, and diagnostics.
 */

import * as vscode from 'vscode';

interface EditorContext {
  file: string;
  language: string;
  selection?: string;
  lineCount: number;
  diagnostics: Array<{ message: string; severity: string; line: number }>;
}

export function initActiveEditorTracker(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => { /* tracked */ }),
    vscode.window.onDidChangeTextEditorSelection(() => { /* tracked */ })
  );
}

export function getCurrentContext(): EditorContext | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;

  const doc = editor.document;
  const selection = editor.selection;
  const selectedText = !selection.isEmpty ? doc.getText(selection) : undefined;
  const diagnostics = vscode.languages.getDiagnostics(doc.uri)
    .map(d => ({
      message: d.message,
      severity: d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
      line: d.range.start.line + 1,
    }));

  return {
    file: doc.uri.fsPath,
    language: doc.languageId,
    selection: selectedText,
    lineCount: doc.lineCount,
    diagnostics,
  };
}

export function getOpenFiles(): Array<{ path: string; language: string; lineCount: number; dirty: boolean }> {
  return vscode.workspace.textDocuments
    .filter(doc => doc.uri.scheme === 'file')
    .map(doc => ({
      path: doc.uri.fsPath,
      language: doc.languageId,
      lineCount: doc.lineCount,
      dirty: doc.isDirty,
    }));
}
