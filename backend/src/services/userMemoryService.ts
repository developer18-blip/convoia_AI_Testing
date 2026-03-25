/**
 * User Memory Service
 *
 * Persistent memory across all chats. Detects when users share personal info,
 * saves it to DB, and injects it into every system prompt.
 */

import prismaClient from '../config/db.js';
import logger from '../config/logger.js';

const prisma = prismaClient as any;

// ── Memory Detection Patterns ────────────────────────────────────────

interface MemoryExtraction {
  shouldSave: boolean;
  memories: Array<{ category: string; key: string; value: string }>;
}

const MEMORY_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  key: string;
  extractor: (match: RegExpMatchArray) => string;
}> = [
  // Name
  { pattern: /my name is ["']?(\w[\w\s]{1,30})["']?/i, category: 'identity', key: 'user_name', extractor: (m) => m[1].trim() },
  { pattern: /(?:call me|i'm|i am) ["']?(\w[\w\s]{1,20})["']?/i, category: 'identity', key: 'nickname', extractor: (m) => m[1].trim() },
  { pattern: /(?:my nickname is|you can call me) ["']?(\w[\w\s]{1,20})["']?/i, category: 'identity', key: 'nickname', extractor: (m) => m[1].trim() },

  // Role/Job
  { pattern: /(?:i am a|i'm a|i work as a?|my role is|my job is|my title is) ["']?(.{3,40})["']?/i, category: 'identity', key: 'role', extractor: (m) => m[1].trim() },
  { pattern: /(?:i work at|i work for|my company is|my organization is) ["']?(.{2,40})["']?/i, category: 'identity', key: 'company', extractor: (m) => m[1].trim() },

  // Location
  { pattern: /(?:i live in|i'm from|i am from|i'm based in|located in) ["']?(.{2,40})["']?/i, category: 'context', key: 'location', extractor: (m) => m[1].trim() },

  // Language
  { pattern: /(?:i speak|my language is|respond in|reply in|answer in) (\w+)/i, category: 'preference', key: 'language', extractor: (m) => m[1].trim() },
  { pattern: /(?:always respond|always reply|always answer) in (\w+)/i, category: 'instruction', key: 'response_language', extractor: (m) => m[1].trim() },

  // Preferences
  { pattern: /(?:i prefer|i like) (?:when you |)([\w\s]{5,60})/i, category: 'preference', key: 'style_preference', extractor: (m) => m[1].trim() },
  { pattern: /(?:always|never) ([\w\s]{5,50})/i, category: 'instruction', key: 'always_rule', extractor: (m) => `Always ${m[1].trim()}` },

  // Remember explicit
  { pattern: /(?:remember|save|store|note) (?:that |this: ?)?(.{5,200})/i, category: 'fact', key: 'user_fact', extractor: (m) => m[1].trim() },
  { pattern: /(?:keep in mind|don't forget) (?:that |)?(.{5,200})/i, category: 'fact', key: 'user_fact', extractor: (m) => m[1].trim() },

  // Age
  { pattern: /(?:i am|i'm) (\d{1,3}) years old/i, category: 'identity', key: 'age', extractor: (m) => m[1] },

  // Timezone
  { pattern: /(?:my timezone is|i'm in|my time zone is) ([\w\/\+\-\s]{3,30})/i, category: 'context', key: 'timezone', extractor: (m) => m[1].trim() },
];

/**
 * Extract memories from a user message.
 */
export function extractMemories(message: string): MemoryExtraction {
  const memories: Array<{ category: string; key: string; value: string }> = [];

  for (const { pattern, category, key, extractor } of MEMORY_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const value = extractor(match);
      if (value && value.length >= 2 && value.length <= 200) {
        // For 'user_fact', make the key unique by appending a hash
        const finalKey = key === 'user_fact' || key === 'always_rule' || key === 'style_preference'
          ? `${key}_${simpleHash(value)}`
          : key;
        memories.push({ category, key: finalKey, value });
      }
    }
  }

  return {
    shouldSave: memories.length > 0,
    memories,
  };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).substring(0, 6);
}

/**
 * Save extracted memories to the database.
 */
export async function saveMemories(userId: string, memories: Array<{ category: string; key: string; value: string }>): Promise<number> {
  let saved = 0;
  for (const mem of memories) {
    try {
      await prisma.userMemory.upsert({
        where: { userId_key: { userId, key: mem.key } },
        create: { userId, category: mem.category, key: mem.key, value: mem.value, source: 'extracted' },
        update: { value: mem.value, category: mem.category, updatedAt: new Date() },
      });
      saved++;
      logger.info(`Memory saved for user ${userId}: ${mem.key} = "${mem.value}"`);
    } catch (err: any) {
      logger.warn(`Failed to save memory: ${err.message}`);
    }
  }
  return saved;
}

/**
 * Load all memories for a user and format as a system prompt section.
 */
export async function getUserMemoryPrompt(userId: string): Promise<string> {
  try {
    const memories = await prisma.userMemory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    if (!memories || memories.length === 0) return '';

    const sections: Record<string, string[]> = {};
    for (const mem of memories) {
      const cat = mem.category || 'general';
      if (!sections[cat]) sections[cat] = [];

      // Format based on key type
      if (mem.key === 'user_name') {
        sections[cat].push(`User's name is "${mem.value}"`);
      } else if (mem.key === 'nickname') {
        sections[cat].push(`User prefers to be called "${mem.value}" in friendly context`);
      } else if (mem.key === 'role') {
        sections[cat].push(`User's role: ${mem.value}`);
      } else if (mem.key === 'company') {
        sections[cat].push(`User works at: ${mem.value}`);
      } else if (mem.key === 'location') {
        sections[cat].push(`User is based in: ${mem.value}`);
      } else if (mem.key === 'language' || mem.key === 'response_language') {
        sections[cat].push(`Respond in: ${mem.value}`);
      } else if (mem.key === 'age') {
        sections[cat].push(`User's age: ${mem.value}`);
      } else if (mem.key === 'timezone') {
        sections[cat].push(`User's timezone: ${mem.value}`);
      } else if (mem.key.startsWith('user_fact')) {
        sections[cat].push(mem.value);
      } else if (mem.key.startsWith('always_rule')) {
        sections[cat].push(mem.value);
      } else if (mem.key.startsWith('style_preference')) {
        sections[cat].push(`User prefers: ${mem.value}`);
      } else {
        sections[cat].push(`${mem.key}: ${mem.value}`);
      }
    }

    let prompt = '\n\n[USER MEMORY — Use this information to personalize responses. This is persistent across all conversations.]\n';
    for (const [category, items] of Object.entries(sections)) {
      prompt += `\n${category.toUpperCase()}:\n`;
      for (const item of items) {
        prompt += `• ${item}\n`;
      }
    }
    prompt += '\n[Always use the user\'s name when appropriate. Maintain a personalized, friendly tone based on saved preferences.]\n';

    return prompt;
  } catch (err: any) {
    logger.warn(`Failed to load user memories: ${err.message}`);
    return '';
  }
}

/**
 * Delete a specific memory.
 */
export async function deleteMemory(userId: string, key: string): Promise<boolean> {
  try {
    await prisma.userMemory.delete({
      where: { userId_key: { userId, key } },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * List all memories for a user.
 */
export async function listMemories(userId: string): Promise<any[]> {
  try {
    return await prisma.userMemory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, category: true, key: true, value: true, createdAt: true, updatedAt: true },
    });
  } catch {
    return [];
  }
}
