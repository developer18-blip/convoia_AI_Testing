/**
 * ConvoiaAI Dev Agent — VS Code Extension Entry Point
 *
 * Provides: chat panel, code actions, model selector, status bar,
 * and MCP server bridge for autonomous tool execution.
 */

import * as vscode from 'vscode';
import { MCPBridge } from './mcp/mcpBridge.js';
import { ConvoiaApiClient } from './api/convoiaApiClient.js';
import { createStatusBar, updateModel, updateBalance, updateConnectionStatus } from './status/statusBar.js';
import { initWorkspaceScanner, getWorkspaceRoot } from './context/workspaceScanner.js';
import { initActiveEditorTracker, getCurrentContext } from './context/activeEditor.js';
import axios from 'axios';

let mcpBridge: MCPBridge | null = null;
let apiClient: ConvoiaApiClient | null = null;
let chatPanel: vscode.WebviewPanel | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('convoia');
  const apiKey = config.get<string>('apiKey') || '';
  const baseUrl = config.get<string>('apiBaseUrl') || 'https://convoia.ai/api';
  const defaultModel = config.get<string>('defaultModel') || 'claude-sonnet-4-6';
  const workspaceRoot = getWorkspaceRoot() || '';

  // Show welcome if no API key
  if (!apiKey) {
    const action = await vscode.window.showInformationMessage(
      'Welcome to ConvoiaAI! Set your API key to get started.',
      'Open Settings'
    );
    if (action === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'convoia.apiKey');
    }
    return;
  }

  // Initialize status bar
  createStatusBar(context);
  updateModel(defaultModel);

  // Initialize workspace tracking
  initWorkspaceScanner(context);
  initActiveEditorTracker(context);

  // Connect MCP bridge or REST API client
  const serverMode = config.get<string>('serverMode') || 'local';
  const apiServerUrl = config.get<string>('apiServerUrl') || 'http://localhost:3600';

  if (serverMode === 'remote') {
    try {
      apiClient = new ConvoiaApiClient(apiServerUrl, apiKey);
      const connected = await apiClient.isConnected();
      updateConnectionStatus(connected);
      if (connected) {
        vscode.window.showInformationMessage(`ConvoiaAI connected to API server at ${apiServerUrl}`);
      } else {
        vscode.window.showWarningMessage(`ConvoiaAI: API server not reachable at ${apiServerUrl}`);
      }
    } catch (err: any) {
      updateConnectionStatus(false);
      vscode.window.showWarningMessage(`ConvoiaAI: Failed to connect to API server: ${err.message}`);
    }
  } else if (workspaceRoot) {
    try {
      const mcpServerPath = config.get<string>('mcpServerPath') || undefined;
      mcpBridge = new MCPBridge(apiKey, baseUrl, workspaceRoot, mcpServerPath);
      await mcpBridge.connect();
      updateConnectionStatus(true);
      vscode.window.showInformationMessage('ConvoiaAI Dev Agent connected (local)');
    } catch (err: any) {
      updateConnectionStatus(false);
      vscode.window.showWarningMessage(`ConvoiaAI: Failed to start MCP server: ${err.message}`);
    }
  }

  // Validate API key and fetch balance
  try {
    const response = await axios.get(`${baseUrl}/token-wallet/balance`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    const balance = response.data?.data?.tokenBalance || 0;
    updateBalance(balance);
  } catch { /* silent — status bar shows 0 */ }

  // Poll balance every 5 minutes
  const balanceInterval = setInterval(async () => {
    try {
      const response = await axios.get(`${baseUrl}/token-wallet/balance`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      });
      updateBalance(response.data?.data?.tokenBalance || 0);
    } catch { /* silent */ }
  }, 5 * 60 * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(balanceInterval) });

  // ── Register Commands ──────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('convoia.openChat', () => openChatPanel(context, apiKey, baseUrl)),
    vscode.commands.registerCommand('convoia.explainCode', () => sendSelectionToChat('explain', context, apiKey, baseUrl)),
    vscode.commands.registerCommand('convoia.refactorCode', () => sendSelectionToChat('refactor', context, apiKey, baseUrl)),
    vscode.commands.registerCommand('convoia.writeTests', () => sendFileToChat('tests', context, apiKey, baseUrl)),
    vscode.commands.registerCommand('convoia.reviewCode', () => sendFileToChat('review', context, apiKey, baseUrl)),
    vscode.commands.registerCommand('convoia.fixError', () => fixCurrentError(context, apiKey, baseUrl)),
    vscode.commands.registerCommand('convoia.askAboutProject', () => askAboutProject(context, apiKey, baseUrl)),
    vscode.commands.registerCommand('convoia.selectModel', () => selectModel()),
    vscode.commands.registerCommand('convoia.showTokenBalance', () => showTokenBalance(apiKey, baseUrl)),
  );
}

export function deactivate(): void {
  if (mcpBridge) {
    mcpBridge.disconnect().catch(() => { /* silent */ });
    mcpBridge = null;
  }
  apiClient = null;
  if (chatPanel) {
    chatPanel.dispose();
    chatPanel = null;
  }
}

// ── Chat Panel ─────────────────────────────────────────────────────

function openChatPanel(context: vscode.ExtensionContext, apiKey: string, baseUrl: string): void {
  if (chatPanel) {
    chatPanel.reveal();
    return;
  }

  chatPanel = vscode.window.createWebviewPanel(
    'convoiaChat',
    'ConvoiaAI Chat',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  chatPanel.webview.html = getChatWebviewHTML();

  chatPanel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === 'sendMessage') {
      await handleChatMessage(msg.content, apiKey, baseUrl, chatPanel!);
    }
  });

  chatPanel.onDidDispose(() => { chatPanel = null; });
}

async function handleChatMessage(content: string, apiKey: string, baseUrl: string, panel: vscode.WebviewPanel): Promise<void> {
  const config = vscode.workspace.getConfiguration('convoia');
  const modelId = config.get<string>('defaultModel') || 'claude-sonnet-4-6';
  const thinkMode = config.get<boolean>('thinkMode') || false;

  // Build rich context from active editor + workspace
  const editorCtx = getCurrentContext();
  let systemContext = 'You are ConvoiaAI Dev Agent, an expert coding assistant. ';
  systemContext += `Workspace: ${getWorkspaceRoot() || 'unknown'}.\n`;

  if (editorCtx?.file) {
    const editor = vscode.window.activeTextEditor;
    const fileContent = editor ? editor.document.getText() : '';
    const selectedText = editorCtx.selection || '';

    systemContext += `\nCurrently open file: ${editorCtx.file} (${editorCtx.language}, ${editorCtx.lineCount} lines)\n`;

    if (selectedText) {
      systemContext += `\nUser has selected this code:\n\`\`\`${editorCtx.language}\n${selectedText}\n\`\`\`\n`;
    }

    // Include file content (truncate to ~8000 chars to avoid token waste)
    if (fileContent) {
      const truncated = fileContent.length > 8000
        ? fileContent.slice(0, 8000) + '\n\n[... truncated ...]'
        : fileContent;
      systemContext += `\nFull file content:\n\`\`\`${editorCtx.language}\n${truncated}\n\`\`\`\n`;
    }

    // Include diagnostics/errors if any
    if (editorCtx.diagnostics.length > 0) {
      systemContext += `\nCurrent errors/warnings:\n${editorCtx.diagnostics.map(d => `  Line ${d.line}: [${d.severity}] ${d.message}`).join('\n')}\n`;
    }
  }

  const messages = [
    { role: 'system', content: systemContext },
    { role: 'user', content },
  ];

  // Use REST API client if available (remote mode)
  if (apiClient) {
    try {
      const result = await apiClient.chatSync({ modelId, messages, thinkMode });
      panel.webview.postMessage({ type: 'response', data: { type: 'chunk', content: result.response } });
      panel.webview.postMessage({ type: 'response', data: { type: 'done' } });
    } catch (err: any) {
      panel.webview.postMessage({ type: 'error', message: err.message });
    }
    return;
  }

  // Direct API call (local mode)
  try {
    const response = await axios.post(
      `${baseUrl}/ai/query/stream`,
      {
        modelId,
        messages,
        thinkingEnabled: thinkMode,
        source: 'vscode',
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 120000,
        responseType: 'text',
      }
    );

    // Parse SSE and stream to webview
    const lines = String(response.data).split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        panel.webview.postMessage({ type: 'response', data: parsed });
      } catch { /* skip */ }
    }
  } catch (err: any) {
    panel.webview.postMessage({ type: 'error', message: err.message });
  }
}

// ── Code Actions ───────────────────────────────────────────────────

function sendSelectionToChat(action: string, context: vscode.ExtensionContext, apiKey: string, baseUrl: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    vscode.window.showWarningMessage('Select some code first.');
    return;
  }

  const code = editor.document.getText(editor.selection);
  const language = editor.document.languageId;
  const prompt = action === 'explain'
    ? `Explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``
    : `Refactor this ${language} code for better readability and maintainability:\n\n\`\`\`${language}\n${code}\n\`\`\``;

  openChatPanel(context, apiKey, baseUrl);
  if (chatPanel) {
    chatPanel.webview.postMessage({ type: 'setInput', content: prompt });
  }
}

function sendFileToChat(action: string, context: vscode.ExtensionContext, apiKey: string, baseUrl: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Open a file first.');
    return;
  }

  const code = editor.document.getText();
  const language = editor.document.languageId;
  const fileName = editor.document.fileName;
  const prompt = action === 'tests'
    ? `Write comprehensive unit tests for this ${language} file (${fileName}):\n\n\`\`\`${language}\n${code}\n\`\`\``
    : `Review this ${language} file (${fileName}) for bugs, security issues, and improvements:\n\n\`\`\`${language}\n${code}\n\`\`\``;

  openChatPanel(context, apiKey, baseUrl);
  if (chatPanel) {
    chatPanel.webview.postMessage({ type: 'setInput', content: prompt });
  }
}

function fixCurrentError(context: vscode.ExtensionContext, apiKey: string, baseUrl: string): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const diagnostics = vscode.languages.getDiagnostics(editor.document.uri)
    .filter(d => d.severity === vscode.DiagnosticSeverity.Error);

  if (diagnostics.length === 0) {
    vscode.window.showInformationMessage('No errors found in current file.');
    return;
  }

  const errorMessages = diagnostics.map(d => `Line ${d.range.start.line + 1}: ${d.message}`).join('\n');
  const code = editor.document.getText();
  const prompt = `Fix these errors in ${editor.document.fileName}:\n\n${errorMessages}\n\nCode:\n\`\`\`${editor.document.languageId}\n${code}\n\`\`\``;

  openChatPanel(context, apiKey, baseUrl);
  if (chatPanel) {
    chatPanel.webview.postMessage({ type: 'setInput', content: prompt });
  }
}

async function askAboutProject(context: vscode.ExtensionContext, apiKey: string, baseUrl: string): Promise<void> {
  const question = await vscode.window.showInputBox({
    prompt: 'Ask about your project',
    placeHolder: 'e.g., "What does the auth middleware do?"',
  });
  if (!question) return;

  openChatPanel(context, apiKey, baseUrl);
  if (chatPanel) {
    chatPanel.webview.postMessage({ type: 'setInput', content: question });
  }
}

// ── Model Selector ─────────────────────────────────────────────────

async function selectModel(): Promise<void> {
  const models = [
    'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
    'gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1', 'gpt-4.1-mini',
    'o3', 'o4-mini', 'gemini-2.5-pro', 'gemini-2.5-flash',
    'deepseek-chat', 'grok-4.20-0309-non-reasoning',
  ];

  const selected = await vscode.window.showQuickPick(models, {
    placeHolder: 'Select AI model for Dev agent',
  });

  if (selected) {
    const config = vscode.workspace.getConfiguration('convoia');
    await config.update('defaultModel', selected, vscode.ConfigurationTarget.Global);
    updateModel(selected);
    vscode.window.showInformationMessage(`Model set to ${selected}`);
  }
}

// ── Token Balance ──────────────────────────────────────────────────

async function showTokenBalance(apiKey: string, baseUrl: string): Promise<void> {
  try {
    if (apiClient) {
      const balance = await apiClient.getBalance();
      vscode.window.showInformationMessage(`Token Balance: ${balance.toLocaleString()} tokens`);
      updateBalance(balance);
      return;
    }

    const response = await axios.get(`${baseUrl}/token-wallet/balance`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    const data = response.data?.data || {};
    vscode.window.showInformationMessage(
      `Token Balance: ${(data.tokenBalance || 0).toLocaleString()} tokens\n` +
      `Total Purchased: ${(data.totalPurchased || 0).toLocaleString()}\n` +
      `Total Used: ${(data.totalUsed || 0).toLocaleString()}`
    );
  } catch {
    vscode.window.showErrorMessage('Failed to fetch token balance.');
  }
}

// ── Chat Webview HTML ──────────────────────────────────────────────

function getChatWebviewHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; padding: 0; font-family: var(--vscode-font-family, sans-serif); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; flex-direction: column; height: 100vh; }
  #messages { flex: 1; overflow-y: auto; padding: 12px; }
  .message { margin-bottom: 12px; padding: 10px 14px; border-radius: 8px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); margin-left: 40px; }
  .assistant { background: var(--vscode-textCodeBlock-background, #1e1e1e); margin-right: 40px; }
  .assistant code { background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 3px; font-family: var(--vscode-editor-font-family, monospace); }
  .assistant pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 6px; overflow-x: auto; }
  .tool-indicator { color: var(--vscode-descriptionForeground); font-size: 12px; padding: 4px 8px; border-left: 2px solid var(--vscode-button-background); margin: 4px 0; }
  #input-area { padding: 12px; border-top: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; }
  #input { flex: 1; padding: 8px 12px; border: 1px solid var(--vscode-input-border, #444); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 6px; font-family: inherit; font-size: 13px; resize: none; min-height: 36px; max-height: 120px; }
  #input:focus { outline: 1px solid var(--vscode-focusBorder); }
  #send { padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
  #send:hover { background: var(--vscode-button-hoverBackground); }
  .status { color: var(--vscode-descriptionForeground); font-style: italic; font-size: 12px; padding: 4px 14px; }
</style>
</head>
<body>
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="input" rows="1" placeholder="Ask ConvoiaAI Dev Agent..."></textarea>
    <button id="send">Send</button>
  </div>
<script>
  const vscode = acquireVsCodeApi();
  const messages = document.getElementById('messages');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  let currentAssistant = null;

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  function send() {
    const text = input.value.trim();
    if (!text) return;
    addMessage('user', text);
    currentAssistant = addMessage('assistant', '');
    vscode.postMessage({ type: 'sendMessage', content: text });
    input.value = '';
    input.style.height = '36px';
  }

  function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = 'message ' + role;
    div.textContent = content;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'response' && msg.data) {
      if (msg.data.type === 'chunk' && currentAssistant) {
        currentAssistant.textContent += msg.data.content;
        messages.scrollTop = messages.scrollHeight;
      } else if (msg.data.type === 'status') {
        const status = document.createElement('div');
        status.className = 'status';
        status.textContent = msg.data.content;
        messages.appendChild(status);
      } else if (msg.data.type === 'tool_use') {
        const tool = document.createElement('div');
        tool.className = 'tool-indicator';
        tool.textContent = '🔧 ' + msg.data.name;
        messages.appendChild(tool);
      } else if (msg.data.type === 'done') {
        currentAssistant = null;
      }
    } else if (msg.type === 'error') {
      addMessage('assistant', '❌ Error: ' + msg.message);
    } else if (msg.type === 'setInput') {
      input.value = msg.content;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }
  });
</script>
</body>
</html>`;
}
