/**
 * Diff Utility — shows proposed changes in VS Code diff editor with accept/reject.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';

export async function showDiffAndApprove(
  filePath: string,
  proposedContent: string,
  title: string
): Promise<boolean> {
  const originalUri = vscode.Uri.file(filePath);
  const proposedUri = vscode.Uri.parse(`convoia-proposed:${filePath}`);

  // Register content provider for proposed content
  const provider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(): string {
      return proposedContent;
    }
  })();

  const disposable = vscode.workspace.registerTextDocumentContentProvider('convoia-proposed', provider);

  try {
    // Open diff editor
    await vscode.commands.executeCommand('vscode.diff', originalUri, proposedUri, `ConvoiaAI: ${title}`);

    // Ask user to accept or reject
    const choice = await vscode.window.showInformationMessage(
      `ConvoiaAI wants to modify ${vscode.workspace.asRelativePath(filePath)}`,
      'Accept Changes',
      'Reject'
    );

    if (choice === 'Accept Changes') {
      fs.writeFileSync(filePath, proposedContent, 'utf-8');
      vscode.window.showInformationMessage(`Changes applied to ${vscode.workspace.asRelativePath(filePath)}`);
      return true;
    }

    return false;
  } finally {
    disposable.dispose();
  }
}
