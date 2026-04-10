/**
 * Status Bar — shows model, token balance, and connection status.
 */

import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
let currentModel = 'Claude Sonnet 4.6';
let tokenBalance = 0;
let connected = false;

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'convoia.selectModel';
  updateDisplay();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  return statusBarItem;
}

export function updateModel(model: string): void {
  currentModel = model;
  updateDisplay();
}

export function updateBalance(balance: number): void {
  tokenBalance = balance;
  updateDisplay();
}

export function updateConnectionStatus(isConnected: boolean): void {
  connected = isConnected;
  updateDisplay();
}

function updateDisplay(): void {
  if (!statusBarItem) return;
  const balanceStr = tokenBalance >= 1_000_000
    ? `${(tokenBalance / 1_000_000).toFixed(1)}M`
    : tokenBalance >= 1_000
    ? `${(tokenBalance / 1_000).toFixed(1)}K`
    : `${tokenBalance}`;
  const connIcon = connected ? '$(circle-filled)' : '$(circle-outline)';
  statusBarItem.text = `$(convoia-icon) ${currentModel} | ${balanceStr} tokens | ${connIcon}`;
  statusBarItem.tooltip = `ConvoiaAI Dev Agent\nModel: ${currentModel}\nTokens: ${tokenBalance.toLocaleString()}\nStatus: ${connected ? 'Connected' : 'Disconnected'}`;
}
