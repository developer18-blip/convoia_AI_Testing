/**
 * Workspace Scanner — detects project structure on activation and file changes.
 */

import * as vscode from 'vscode';

export function initWorkspaceScanner(context: vscode.ExtensionContext): void {
  // Scan on activation
  scanWorkspace();

  // Re-scan on file save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      // Debounce: don't re-scan on every save
    }),
    vscode.workspace.onDidCreateFiles(() => scanWorkspace()),
    vscode.workspace.onDidDeleteFiles(() => scanWorkspace())
  );
}

function scanWorkspace(): void {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;
  // Workspace root is available via folders[0].uri.fsPath
  // MCP server handles the actual scanning
}

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
