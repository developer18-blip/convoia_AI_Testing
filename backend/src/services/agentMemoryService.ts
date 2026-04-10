/**
 * Agent Memory Service — Two-layer persistent memory for autonomous agents
 *
 * Layer 1: User preferences — persists across ALL conversations (languages, frameworks, style)
 * Layer 2: Project context — persists per project (tech stack, conventions, known issues)
 *
 * Memory extraction runs after each conversation turn using a cheap model (gpt-4o-mini).
 */

import axios from 'axios';
import prisma from '../config/db.js';
import logger from '../config/logger.js';

// ── Types ────────────────────────────────────────────────────────────

export interface UserDevPreferences {
  languages: string[];
  frameworks: string[];
  style: string;
  conventions: string[];
  testingPreference: string;
  other: Record<string, string>;
}

export interface ProjectContext {
  techStack: string[];
  conventions: string[];
  recentFiles: string[];
  knownIssues: string[];
}

// ── Memory CRUD ──────────────────────────────────────────────────────

export async function getAgentMemory(userId: string, agentId: string): Promise<Record<string, any>> {
  const memories = await prisma.agentMemory.findMany({
    where: { userId, agentId },
    orderBy: { updatedAt: 'desc' },
  });

  const result: Record<string, any> = {};
  for (const m of memories) {
    result[`${m.type}:${m.key}`] = m.value;
  }
  return result;
}

export async function getUserPreferences(userId: string, agentId: string): Promise<UserDevPreferences> {
  const prefs = await prisma.agentMemory.findMany({
    where: { userId, agentId, type: 'user_preference' },
  });

  const defaults: UserDevPreferences = {
    languages: [],
    frameworks: [],
    style: 'mixed',
    conventions: [],
    testingPreference: '',
    other: {},
  };

  for (const p of prefs) {
    if (p.key in defaults) {
      (defaults as any)[p.key] = p.value;
    }
  }
  return defaults;
}

export async function setMemory(
  userId: string, agentId: string, type: string, key: string, value: any
): Promise<void> {
  await prisma.agentMemory.upsert({
    where: { userId_agentId_type_key: { userId, agentId, type, key } },
    update: { value },
    create: { userId, agentId, type, key, value },
  });
}

export async function deleteMemory(
  userId: string, agentId: string, type: string, key: string
): Promise<void> {
  await prisma.agentMemory.deleteMany({
    where: { userId, agentId, type, key },
  });
}

// ── Project Context ──────────────────────────────────────────────────

export async function getProjectContext(
  userId: string, agentId: string, projectName: string
): Promise<ProjectContext | null> {
  const project = await prisma.agentProject.findUnique({
    where: { userId_agentId_name: { userId, agentId, name: projectName } },
  });

  if (!project) return null;

  return {
    techStack: (project.techStack as string[]) || [],
    conventions: (project.conventions as string[]) || [],
    recentFiles: [],
    knownIssues: [],
  };
}

export async function updateProjectContext(
  userId: string, agentId: string, projectName: string,
  updates: Partial<{ techStack: string[]; conventions: string[]; fileTree: string }>
): Promise<void> {
  await prisma.agentProject.upsert({
    where: { userId_agentId_name: { userId, agentId, name: projectName } },
    update: {
      ...(updates.techStack ? { techStack: updates.techStack } : {}),
      ...(updates.conventions ? { conventions: updates.conventions } : {}),
      ...(updates.fileTree ? { fileTree: updates.fileTree } : {}),
    },
    create: {
      userId, agentId, name: projectName,
      techStack: updates.techStack || [],
      conventions: updates.conventions || [],
      fileTree: updates.fileTree,
    },
  });
}

// ── Memory Extraction (runs after each conversation turn) ────────────

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze this conversation turn and extract any user preferences or project context that should be remembered.

Respond with ONLY valid JSON:
{
  "preferences": {
    "languages": [],
    "frameworks": [],
    "style": null,
    "conventions": [],
    "testingPreference": null
  },
  "projectUpdates": {
    "techStack": [],
    "conventions": [],
    "knownIssues": []
  }
}

Rules:
- Only include fields that were EXPLICITLY mentioned in this turn
- Empty arrays/null for fields not mentioned
- "style" is one of: "functional", "OOP", "mixed", or null
- "conventions" are things like "use-semicolons", "single-quotes", "tabs-not-spaces"
- Merge with existing, don't replace (caller handles merge)`;

export async function extractMemoryFromTurn(
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
  fastModel: string = 'gpt-4o-mini'
): Promise<{
  preferences: Partial<UserDevPreferences>;
  projectUpdates: Partial<ProjectContext>;
} | null> {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: fastModel,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: `User: "${userMessage.slice(0, 500)}"\n\nAssistant: "${assistantMessage.slice(0, 500)}"` },
        ],
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 8000,
      }
    );

    const text = response.data.choices?.[0]?.message?.content;
    if (!text) return null;

    const parsed = JSON.parse(text);
    return {
      preferences: parsed.preferences || {},
      projectUpdates: parsed.projectUpdates || {},
    };
  } catch (err: any) {
    logger.warn(`Memory extraction failed: ${err.message}`);
    return null;
  }
}

/**
 * Merge extracted memory into persistent storage.
 * Arrays are merged (deduplicated). Scalars are overwritten only if non-null.
 */
export async function mergeExtractedMemory(
  userId: string, agentId: string,
  extracted: { preferences: Partial<UserDevPreferences>; projectUpdates: Partial<ProjectContext> },
  projectName?: string
): Promise<void> {
  const { preferences, projectUpdates } = extracted;

  // Merge user preferences
  const existing = await getUserPreferences(userId, agentId);

  for (const [key, value] of Object.entries(preferences)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (Array.isArray(value)) {
      const existingArr = (existing as any)[key] || [];
      const merged = [...new Set([...existingArr, ...value])];
      await setMemory(userId, agentId, 'user_preference', key, merged);
    } else if (typeof value === 'string' && value.trim()) {
      await setMemory(userId, agentId, 'user_preference', key, value);
    }
  }

  // Merge project context
  if (projectName && projectUpdates) {
    const existingProject = await getProjectContext(userId, agentId, projectName);
    const updates: Partial<{ techStack: string[]; conventions: string[] }> = {};

    if (projectUpdates.techStack?.length) {
      updates.techStack = [...new Set([...(existingProject?.techStack || []), ...projectUpdates.techStack])];
    }
    if (projectUpdates.conventions?.length) {
      updates.conventions = [...new Set([...(existingProject?.conventions || []), ...projectUpdates.conventions])];
    }

    if (Object.keys(updates).length > 0) {
      await updateProjectContext(userId, agentId, projectName, updates);
    }
  }
}

// ── Build Memory Prompt Section ──────────────────────────────────────

/**
 * Build a compact memory context string to inject into the agent's system prompt.
 */
export async function buildMemoryPrompt(
  userId: string, agentId: string, projectName?: string
): Promise<string> {
  const prefs = await getUserPreferences(userId, agentId);
  const project = projectName ? await getProjectContext(userId, agentId, projectName) : null;

  const sections: string[] = [];

  // User preferences
  const prefLines: string[] = [];
  if (prefs.languages.length) prefLines.push(`Languages: ${prefs.languages.join(', ')}`);
  if (prefs.frameworks.length) prefLines.push(`Frameworks: ${prefs.frameworks.join(', ')}`);
  if (prefs.style && prefs.style !== 'mixed') prefLines.push(`Style: ${prefs.style}`);
  if (prefs.conventions.length) prefLines.push(`Conventions: ${prefs.conventions.join(', ')}`);
  if (prefs.testingPreference) prefLines.push(`Testing: ${prefs.testingPreference}`);

  if (prefLines.length > 0) {
    sections.push(`[USER CODING PREFERENCES]\n${prefLines.join('\n')}`);
  }

  // Project context
  if (project) {
    const projLines: string[] = [];
    if (project.techStack.length) projLines.push(`Stack: ${project.techStack.join(', ')}`);
    if (project.conventions.length) projLines.push(`Conventions: ${project.conventions.join(', ')}`);
    if (project.knownIssues.length) projLines.push(`Known issues: ${project.knownIssues.join('; ')}`);

    if (projLines.length > 0) {
      sections.push(`[PROJECT: ${projectName}]\n${projLines.join('\n')}`);
    }
  }

  return sections.length > 0
    ? `\n\n[AGENT MEMORY — Use this to personalize responses]\n${sections.join('\n\n')}\n`
    : '';
}
