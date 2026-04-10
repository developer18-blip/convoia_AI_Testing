/**
 * Memory Sync — syncs agent memory with ConvoiaAI backend.
 * - On startup: loads user preferences
 * - After each turn: saves updates (debounced, max once per 30s)
 */

import axios from 'axios';

interface MemoryEntry {
  type: string;
  key: string;
  value: unknown;
}

let cachedMemory: MemoryEntry[] = [];
let lastSyncTime = 0;
const SYNC_DEBOUNCE = 30_000; // 30 seconds

export async function loadMemory(apiKey: string, baseUrl: string, agentId: string): Promise<MemoryEntry[]> {
  try {
    const response = await axios.get(`${baseUrl}/agent-tools/${agentId}/memory`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });
    const data = response.data?.data || {};
    cachedMemory = Object.entries(data).map(([compositeKey, value]) => {
      const [type, ...keyParts] = compositeKey.split(':');
      return { type, key: keyParts.join(':'), value };
    });
    return cachedMemory;
  } catch {
    return [];
  }
}

export async function saveMemory(
  apiKey: string, baseUrl: string, agentId: string,
  type: string, key: string, value: unknown
): Promise<void> {
  const now = Date.now();
  if (now - lastSyncTime < SYNC_DEBOUNCE) return;
  lastSyncTime = now;

  try {
    await axios.put(
      `${baseUrl}/agent-tools/${agentId}/memory`,
      { type, key, value },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 }
    );
  } catch { /* non-critical */ }
}

export function getCachedMemory(): MemoryEntry[] {
  return cachedMemory;
}

export function buildMemoryContext(): string {
  if (cachedMemory.length === 0) return '';

  const sections: string[] = [];
  const prefs = cachedMemory.filter(m => m.type === 'user_preference');
  const projects = cachedMemory.filter(m => m.type === 'project_context');

  if (prefs.length > 0) {
    sections.push('[USER PREFERENCES]\n' + prefs.map(p => `${p.key}: ${JSON.stringify(p.value)}`).join('\n'));
  }
  if (projects.length > 0) {
    sections.push('[PROJECT CONTEXT]\n' + projects.map(p => `${p.key}: ${JSON.stringify(p.value)}`).join('\n'));
  }

  return sections.length > 0 ? '\n\n[AGENT MEMORY]\n' + sections.join('\n\n') + '\n' : '';
}
